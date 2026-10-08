import { TaskFailedError, task, workflow } from "@aikirun/workflow";
import type { EventWaiter, WorkflowRun, WorkflowRunHandle, WorkflowVersion } from "@aikirun/workflow";
import {
  ORCHESTRATION_PIPELINE,
  STAGE_EXECUTION_POLICIES,
  STAGE_OUTCOMES,
  agentForStage,
} from "@isotopy/core";
import type {
  EngineLimit,
  LimitChoice,
  PipelineGroup,
  StageDefinition,
  StageExecutionPolicy,
} from "@isotopy/core";
import { limitWaitMs } from "../domain/rules/engine-limit.ts";
import { suppressionReason } from "../domain/rules/run-lifecycle.ts";
import type { SeededStage } from "../domain/rules/run-seeding.ts";
import type { StageExchange } from "../domain/markdown/stage.ts";
import { PIPELINE_EVENTS } from "./pipeline-events.ts";
import type { PipelineEvents } from "./pipeline-events.ts";
import { createPipelineTasks } from "./pipeline-tasks.ts";
import type { PipelineTasks } from "./pipeline-tasks.ts";
import type {
  PipelineWorkflowInput,
  QuestionMediationResult,
  RunCompletionStatus,
  StageOutcome,
  StageTurn,
  StageWorkContext,
  WorkflowDeps,
} from "./types.ts";
import type { QuestionMediationRequest } from "./types.ts";

export const PIPELINE_WORKFLOW_NAME = "isotopy-pipeline";

const PIPELINE_WORKFLOW_VERSION = "1.0.0";

export interface PipelineWorkflowResult {
  status: RunCompletionStatus | "cancelled";
}

export type PipelineRun = Readonly<WorkflowRun<null, PipelineEvents>>;

export type PipelineWorkflow = WorkflowVersion<
  PipelineWorkflowInput,
  PipelineWorkflowResult,
  null,
  PipelineEvents
>;

export type PipelineRunHandle = WorkflowRunHandle<PipelineWorkflowResult, null, PipelineEvents>;

interface PipelineContext {
  run: PipelineRun;
  tasks: PipelineTasks;
  deps: WorkflowDeps;
  input: PipelineWorkflowInput;
}

type StageTurnsResult =
  | { outcome: Exclude<StageOutcome, typeof STAGE_OUTCOMES.LIMITED> }
  | { outcome: typeof STAGE_OUTCOMES.LIMITED; limit: EngineLimit };

type QuestionFailureOutcome =
  | typeof STAGE_OUTCOMES.NEEDS_ATTENTION
  | typeof STAGE_OUTCOMES.FAILED
  | typeof STAGE_OUTCOMES.CANCELLED;

type QuestionResolution =
  | { outcome: typeof STAGE_OUTCOMES.PASSED; answer: string }
  | { outcome: QuestionFailureOutcome };

interface QuestionContext extends PipelineContext {
  stageDef: StageDefinition;
  turnIndex: number;
}

interface StageEvent {
  stageId: string;
}

interface StageRef {
  runId: string;
  stageId: string;
}

const MEDIATION_FAILURE_MESSAGES = {
  mediation_failed: "Orchestrator could not mediate the question",
  invalid_first_action: "Orchestrator returned an invalid first mediation action",
  routing_failed: "Orchestrator could not route the user's answer",
} as const;

type MediationFailureCause = keyof typeof MEDIATION_FAILURE_MESSAGES;

interface MediationFailure extends StageRef {
  cause: MediationFailureCause;
  detail?: string;
}

interface StageQuestion extends StageRef {
  question: string;
}

interface StageBlock extends StageRef {
  limit: EngineLimit;
  attempt: number;
}

interface CarriedStage {
  runId: string;
  stageDef: StageDefinition;
  seeded: SeededStage;
}

interface SuppressedStage {
  runId: string;
  stageDef: StageDefinition;
  cause: RunCompletionStatus;
}

function stageRef(ctx: PipelineContext, stageDef: StageDefinition): StageRef {
  return { runId: ctx.input.runId, stageId: stageDef.id };
}

function workContext(input: PipelineWorkflowInput): StageWorkContext {
  return { runId: input.runId, task: input.task, permissionMode: input.permissionMode };
}

async function awaitStageEvent<Data extends StageEvent>(
  waiter: EventWaiter<Data>,
  stageId: string,
): Promise<Data> {
  for (;;) {
    const { data } = await waiter.wait();
    if (data.stageId === stageId) {
      return data;
    }
  }
}

async function awaitStageEventUntil<Data extends StageEvent>(
  waiter: EventWaiter<Data>,
  stageId: string,
  timeoutMs: number,
): Promise<Data | undefined> {
  for (;;) {
    const received = await waiter.wait({ timeout: { milliseconds: timeoutMs } });
    if (received.timeout) {
      return undefined;
    }
    if (received.data.stageId === stageId) {
      return received.data;
    }
  }
}

async function awaitLimitChoice(
  ctx: PipelineContext,
  stageDef: StageDefinition,
  limit: EngineLimit,
): Promise<LimitChoice | undefined> {
  const resolved = await awaitStageEventUntil(
    ctx.run.events.limit,
    stageDef.id,
    limitWaitMs(limit),
  );
  return resolved?.choice;
}

async function failQuestionMediation(
  ctx: QuestionContext,
  outcome: QuestionFailureOutcome,
  cause: MediationFailureCause,
  detail?: string,
): Promise<QuestionResolution> {
  await task({
    name: "isotopy.question-mediation-failed",
    handler: async (failure: MediationFailure) =>
      ctx.deps.projection.stageFailed(
        failure.runId,
        failure.stageId,
        failure.detail ?? MEDIATION_FAILURE_MESSAGES[failure.cause],
      ),
  }).start(ctx.run, { ...stageRef(ctx, ctx.stageDef), cause, detail });
  return { outcome };
}

function questionFailureOutcome(outcome: StageOutcome): QuestionFailureOutcome {
  if (outcome === STAGE_OUTCOMES.FAILED) {
    return STAGE_OUTCOMES.FAILED;
  }
  if (outcome === STAGE_OUTCOMES.CANCELLED) {
    return STAGE_OUTCOMES.CANCELLED;
  }
  return STAGE_OUTCOMES.NEEDS_ATTENTION;
}

async function waitOutLimit(
  ctx: PipelineContext,
  stageDef: StageDefinition,
  attempt: number,
  limit: EngineLimit,
): Promise<void> {
  const { run, deps } = ctx;
  await task({
    name: "isotopy.stage-blocked",
    handler: async (blocked: StageBlock) =>
      deps.projection.stageBlocked(blocked.runId, blocked.stageId, blocked.limit, blocked.attempt),
  }).start(run, { ...stageRef(ctx, stageDef), limit, attempt });
  const choice = await awaitLimitChoice(ctx, stageDef, limit);
  await task({
    name: "isotopy.limit-resolved",
    handler: async (resolved: StageRef & { choice?: LimitChoice }) =>
      deps.projection.limitResolved(resolved.runId, resolved.stageId, resolved.choice),
  }).start(run, { ...stageRef(ctx, stageDef), choice });
}

async function mediateQuestion(
  ctx: QuestionContext,
  request: QuestionMediationRequest,
  resumeSessionId?: string,
): Promise<QuestionMediationResult> {
  const { run, tasks, input, stageDef } = ctx;
  for (let mediationAttempt = 0; ; mediationAttempt += 1) {
    const result = await tasks.mediation.start(run, {
      context: workContext(input),
      stageDef,
      request,
      resumeSessionId,
    });
    if (result.outcome !== STAGE_OUTCOMES.LIMITED || result.limit === undefined) {
      return result;
    }
    await waitOutLimit(ctx, stageDef, mediationAttempt + 1, result.limit);
  }
}

async function waitForUserAnswer(ctx: QuestionContext, question: string): Promise<string> {
  const { run, deps, stageDef } = ctx;
  await task({
    name: "isotopy.stage-asking",
    handler: async (asking: StageQuestion) =>
      deps.projection.stageAsking(asking.runId, asking.stageId, asking.question),
  }).start(run, { ...stageRef(ctx, stageDef), question });
  const answer = await awaitStageEvent(run.events.answer, stageDef.id);
  return answer.text;
}

async function recordMediatedAnswer(ctx: QuestionContext, answer: string): Promise<void> {
  await task({
    name: "isotopy.stage-mediated-answer",
    handler: async (mediated: StageRef & { answer: string }) =>
      ctx.deps.projection.stageMediatedAnswer(mediated.runId, mediated.stageId, mediated.answer),
  }).start(ctx.run, { ...stageRef(ctx, ctx.stageDef), answer });
}

async function resolveSpecialistQuestion(
  ctx: QuestionContext,
  question: string,
): Promise<QuestionResolution> {
  const { run, deps, input, stageDef } = ctx;
  await task({
    name: "isotopy.stage-question",
    handler: async (asked: StageQuestion) =>
      deps.projection.stageQuestion(asked.runId, asked.stageId, asked.question),
  }).start(run, { ...stageRef(ctx, stageDef), question });
  const request: QuestionMediationRequest = {
    runId: input.runId,
    stageId: stageDef.id,
    stageTurn: ctx.turnIndex,
    phase: "question",
    question,
  };
  const mediated = await mediateQuestion(ctx, request);
  if (mediated.outcome === STAGE_OUTCOMES.CANCELLED) {
    return { outcome: STAGE_OUTCOMES.CANCELLED };
  }
  if (mediated.outcome !== STAGE_OUTCOMES.PASSED || !mediated.decision) {
    return failQuestionMediation(
      ctx,
      questionFailureOutcome(mediated.outcome),
      "mediation_failed",
      mediated.failureMessage,
    );
  }
  if (mediated.decision.action === "answer_agent") {
    const answer = mediated.decision.answer;
    await recordMediatedAnswer(ctx, answer);
    return { outcome: STAGE_OUTCOMES.PASSED, answer };
  }
  if (mediated.decision.action !== "escalate_to_user") {
    return failQuestionMediation(ctx, STAGE_OUTCOMES.NEEDS_ATTENTION, "invalid_first_action");
  }
  const userAnswer = await waitForUserAnswer(ctx, mediated.decision.question);
  const routed = await mediateQuestion(
    ctx,
    { ...request, phase: "user_answer", userAnswer },
    mediated.sessionId,
  );
  if (routed.outcome === STAGE_OUTCOMES.CANCELLED) {
    return { outcome: STAGE_OUTCOMES.CANCELLED };
  }
  if (
    routed.outcome !== STAGE_OUTCOMES.PASSED ||
    routed.decision?.action !== "route_to_agent"
  ) {
    return failQuestionMediation(
      ctx,
      questionFailureOutcome(routed.outcome),
      "routing_failed",
      routed.failureMessage,
    );
  }
  const answer = routed.decision.message;
  await recordMediatedAnswer(ctx, answer);
  return { outcome: STAGE_OUTCOMES.PASSED, answer };
}

async function resolveQuestion(ctx: QuestionContext, question: string): Promise<QuestionResolution> {
  if (ctx.input.pipeline.id !== ORCHESTRATION_PIPELINE.id) {
    return resolveSpecialistQuestion(ctx, question);
  }
  const answer = await waitForUserAnswer(ctx, question);
  return { outcome: STAGE_OUTCOMES.PASSED, answer };
}

function firstTurn(
  input: PipelineWorkflowInput,
  stageDef: StageDefinition,
  attempt: number,
): StageTurn {
  const seeded = input.seeded;
  const resumable =
    attempt === 0 &&
    seeded?.startStageId === stageDef.id &&
    seeded.resumeSessionId !== undefined;
  return resumable ? { index: 0, resumeSessionId: seeded?.resumeSessionId } : { index: 0 };
}

function nextTurn(turn: StageTurn, exchange: StageExchange, sessionId: string | undefined): StageTurn {
  const next: StageTurn = {
    index: turn.index + 1,
    answer: exchange.answer,
    exchanges: [...(turn.exchanges ?? []), exchange],
  };
  if (sessionId !== undefined) {
    next.resumeSessionId = sessionId;
  }
  return next;
}

async function runStageTurns(
  ctx: PipelineContext,
  stageDef: StageDefinition,
  attempt: number,
): Promise<StageTurnsResult> {
  const { run, tasks, input } = ctx;
  let turn: StageTurn = firstTurn(input, stageDef, attempt);

  for (;;) {
    const result = await tasks.stageTurn.start(run, {
      context: workContext(input),
      stageDef,
      turn,
    });
    if (result.outcome === STAGE_OUTCOMES.LIMITED) {
      return result.limit
        ? { outcome: STAGE_OUTCOMES.LIMITED, limit: result.limit }
        : { outcome: STAGE_OUTCOMES.FAILED };
    }
    if (result.outcome !== STAGE_OUTCOMES.ASKING) {
      return { outcome: result.outcome };
    }

    const question = result.question ?? "";
    const resolution = await resolveQuestion({ ...ctx, stageDef, turnIndex: turn.index }, question);
    if (resolution.outcome !== STAGE_OUTCOMES.PASSED) {
      return { outcome: resolution.outcome };
    }

    const exchange: StageExchange = { question, answer: resolution.answer };
    if (result.output !== undefined) {
      exchange.output = result.output;
    }
    turn = nextTurn(turn, exchange, result.sessionId);
  }
}

async function runStageToOutcome(
  ctx: PipelineContext,
  stageDef: StageDefinition,
): Promise<StageOutcome> {
  for (let attempt = 0; ; attempt += 1) {
    const result = await runStageTurns(ctx, stageDef, attempt);
    if (result.outcome !== STAGE_OUTCOMES.LIMITED || result.limit === undefined) {
      return result.outcome;
    }
    await waitOutLimit(ctx, stageDef, attempt + 1, result.limit);
  }
}

async function failStageOnTaskFailure(
  ctx: PipelineContext,
  stageDef: StageDefinition,
): Promise<StageOutcome> {
  try {
    return await runStageToOutcome(ctx, stageDef);
  } catch (error) {
    if (!(error instanceof TaskFailedError)) {
      throw error;
    }
    await task({
      name: "isotopy.stage-failed",
      handler: async (failed: StageRef & { reason: string }) =>
        ctx.deps.projection.stageFailed(failed.runId, failed.stageId, failed.reason),
    }).start(ctx.run, { ...stageRef(ctx, stageDef), reason: error.reason });
    return STAGE_OUTCOMES.FAILED;
  }
}

async function runOneStage(
  ctx: PipelineContext,
  stageDef: StageDefinition,
): Promise<StageOutcome> {
  const { run, deps } = ctx;
  const outcome = await failStageOnTaskFailure(ctx, stageDef);
  if (outcome !== STAGE_OUTCOMES.PASSED || !stageDef.gateAfter) {
    return outcome;
  }

  await task({
    name: "isotopy.stage-awaiting",
    handler: async (awaiting: StageRef) =>
      deps.projection.stageAwaiting(awaiting.runId, awaiting.stageId),
  }).start(run, stageRef(ctx, stageDef));
  await awaitStageEvent(run.events.gate, stageDef.id);
  return STAGE_OUTCOMES.PASSED;
}

interface WalkState {
  reached: boolean;
  status: RunCompletionStatus;
}

function executionPolicy(stageDef: StageDefinition): StageExecutionPolicy {
  return stageDef.executionPolicy ?? STAGE_EXECUTION_POLICIES.STANDARD;
}

function canRunStage(stageDef: StageDefinition, status: RunCompletionStatus): boolean {
  if (status === "completed") {
    return true;
  }
  const policy = executionPolicy(stageDef);
  if (status === "needs_attention") {
    return (
      policy === STAGE_EXECUTION_POLICIES.QUALITY ||
      policy === STAGE_EXECUTION_POLICIES.CLOSEOUT
    );
  }
  return policy === STAGE_EXECUTION_POLICIES.CLOSEOUT;
}

function mergeOutcome(status: RunCompletionStatus, outcome: StageOutcome): RunCompletionStatus {
  if (outcome === STAGE_OUTCOMES.FAILED) {
    return "failed";
  }
  if (outcome === STAGE_OUTCOMES.NEEDS_ATTENTION && status !== "failed") {
    return "needs_attention";
  }
  return status;
}

async function suppressStage(
  ctx: PipelineContext,
  stageDef: StageDefinition,
  cause: RunCompletionStatus,
): Promise<void> {
  const { projection } = ctx.deps;
  await task({
    name: "isotopy.stage-suppressed",
    async handler(suppressed: SuppressedStage) {
      const profession = agentForStage(suppressed.stageDef).profession;
      const message = `${profession} suppressed because of ${suppressionReason(suppressed.cause)}`;
      projection.log(suppressed.runId, suppressed.stageDef.id, { level: "warn", message });
      projection.stageSkipped(suppressed.runId, suppressed.stageDef.id);
    },
  }).start(ctx.run, { runId: ctx.input.runId, stageDef, cause });
}

async function runGroup(
  ctx: PipelineContext,
  group: PipelineGroup,
  walk: WalkState,
): Promise<boolean> {
  const { run, deps, input } = ctx;
  const seeded = input.seeded;

  for (const stageDef of group.stages) {
    if (!walk.reached) {
      if (stageDef.id === seeded?.startStageId) {
        walk.reached = true;
      } else {
        await task({
          name: "isotopy.stage-seeded",
          handler: async (carried: CarriedStage) =>
            deps.projection.applySeededStage(carried.runId, carried.stageDef, carried.seeded),
        }).start(run, {
          runId: input.runId,
          stageDef,
          seeded: { output: seeded?.outputs[stageDef.id], from: seeded?.from },
        });
        const seededOutcome = seeded?.outcomes[stageDef.id];
        if (seededOutcome !== undefined) {
          walk.status = mergeOutcome(walk.status, seededOutcome);
        }
        continue;
      }
    }
    if (!canRunStage(stageDef, walk.status)) {
      await suppressStage(ctx, stageDef, walk.status);
      continue;
    }
    const outcome = await runOneStage(ctx, stageDef);
    if (outcome === STAGE_OUTCOMES.CANCELLED) {
      return true;
    }
    walk.status = mergeOutcome(walk.status, outcome);
  }
  return false;
}

async function runPipeline(
  run: PipelineRun,
  tasks: PipelineTasks,
  deps: WorkflowDeps,
  input: PipelineWorkflowInput,
): Promise<PipelineWorkflowResult> {
  const ctx: PipelineContext = { run, tasks, deps, input };
  const { runId, pipeline } = input;

  await task({
    name: "isotopy.run-started",
    handler: async (started: { runId: string; message: string }) =>
      deps.projection.runStarted(started.runId, started.message),
  }).start(run, { runId, message: input.startedMessage });

  const walk: WalkState = {
    reached: input.seeded === undefined,
    status: "completed",
  };

  for (const group of pipeline.groups) {
    const cancelled = await runGroup(ctx, group, walk);
    if (cancelled) {
      return { status: "cancelled" };
    }
  }

  const status = walk.status;
  if (pipeline.id !== ORCHESTRATION_PIPELINE.id) {
    await tasks.review.start(run, { context: workContext(input), status });
  }

  await task({
    name: "isotopy.run-completed",
    handler: (completed: { runId: string; status: RunCompletionStatus }) =>
      deps.projection.runCompleted(completed.runId, completed.status),
  }).start(run, { runId, status });
  return { status };
}

export function createPipelineWorkflow(deps: WorkflowDeps): PipelineWorkflow {
  const tasks = createPipelineTasks(deps);
  return workflow({ name: PIPELINE_WORKFLOW_NAME }).v<
    PipelineWorkflowInput,
    PipelineWorkflowResult,
    PipelineEvents
  >(PIPELINE_WORKFLOW_VERSION, {
    events: PIPELINE_EVENTS,
    handler: (run, input) => runPipeline(run, tasks, deps, input),
  });
}

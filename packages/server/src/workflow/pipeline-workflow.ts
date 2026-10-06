import { TaskFailedError, workflow } from "@aikirun/workflow";
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
  message: string,
): Promise<QuestionResolution> {
  await ctx.tasks.project.start(ctx.run, {
    kind: "stageFailed",
    runId: ctx.input.runId,
    stageId: ctx.stageDef.id,
    message,
  });
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
): Promise<boolean> {
  const { run, tasks, deps, input } = ctx;
  await tasks.project.start(run, {
    kind: "stageBlocked",
    runId: input.runId,
    stageId: stageDef.id,
    limit,
    attempt,
  });
  const choice = await awaitLimitChoice(ctx, stageDef, limit);
  if (deps.isCancelled(input.runId)) {
    return false;
  }
  await tasks.project.start(run, {
    kind: "limitResolved",
    runId: input.runId,
    stageId: stageDef.id,
    choice,
  });
  return true;
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
    const resumed = await waitOutLimit(ctx, stageDef, mediationAttempt + 1, result.limit);
    if (!resumed) {
      return { outcome: STAGE_OUTCOMES.CANCELLED };
    }
  }
}

async function waitForUserAnswer(ctx: QuestionContext, question: string): Promise<string> {
  const { run, tasks, input, stageDef } = ctx;
  await tasks.project.start(run, {
    kind: "stageAsking",
    runId: input.runId,
    stageId: stageDef.id,
    question,
  });
  const answer = await awaitStageEvent(run.events.answer, stageDef.id);
  return answer.text;
}

async function recordMediatedAnswer(ctx: QuestionContext, answer: string): Promise<void> {
  await ctx.tasks.project.start(ctx.run, {
    kind: "stageMediatedAnswer",
    runId: ctx.input.runId,
    stageId: ctx.stageDef.id,
    answer,
  });
}

async function resolveSpecialistQuestion(
  ctx: QuestionContext,
  question: string,
): Promise<QuestionResolution> {
  const { run, tasks, deps, input, stageDef } = ctx;
  await tasks.project.start(run, {
    kind: "stageQuestion",
    runId: input.runId,
    stageId: stageDef.id,
    question,
  });
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
      mediated.failureMessage ?? "Orchestrator could not mediate the question",
    );
  }
  if (mediated.decision.action === "answer_agent") {
    const answer = mediated.decision.answer;
    await recordMediatedAnswer(ctx, answer);
    return { outcome: STAGE_OUTCOMES.PASSED, answer };
  }
  if (mediated.decision.action !== "escalate_to_user") {
    return failQuestionMediation(
      ctx,
      STAGE_OUTCOMES.NEEDS_ATTENTION,
      "Orchestrator returned an invalid first mediation action",
    );
  }
  const userAnswer = await waitForUserAnswer(ctx, mediated.decision.question);
  if (deps.isCancelled(input.runId)) {
    return { outcome: STAGE_OUTCOMES.CANCELLED };
  }
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
      routed.failureMessage ?? "Orchestrator could not route the user's answer",
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
  return ctx.deps.isCancelled(ctx.input.runId)
    ? { outcome: STAGE_OUTCOMES.CANCELLED }
    : { outcome: STAGE_OUTCOMES.PASSED, answer };
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
    const resumed = await waitOutLimit(ctx, stageDef, attempt + 1, result.limit);
    if (!resumed) {
      return STAGE_OUTCOMES.CANCELLED;
    }
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
    await ctx.tasks.project.start(ctx.run, {
      kind: "stageFailed",
      runId: ctx.input.runId,
      stageId: stageDef.id,
      message: error.reason,
    });
    return STAGE_OUTCOMES.FAILED;
  }
}

async function runOneStage(
  ctx: PipelineContext,
  stageDef: StageDefinition,
): Promise<StageOutcome> {
  const { run, tasks, deps, input } = ctx;
  const outcome = await failStageOnTaskFailure(ctx, stageDef);
  if (outcome !== STAGE_OUTCOMES.PASSED || !stageDef.gateAfter) {
    return outcome;
  }

  await tasks.project.start(run, {
    kind: "stageAwaiting",
    runId: input.runId,
    stageId: stageDef.id,
  });
  await awaitStageEvent(run.events.gate, stageDef.id);
  return deps.isCancelled(input.runId) ? STAGE_OUTCOMES.CANCELLED : STAGE_OUTCOMES.PASSED;
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
  const { run, tasks, input } = ctx;
  const profession = agentForStage(stageDef).profession;
  await tasks.project.start(run, {
    kind: "log",
    runId: input.runId,
    stageId: stageDef.id,
    draft: { level: "warn", message: `${profession} suppressed because of ${suppressionReason(cause)}` },
  });
  await tasks.project.start(run, { kind: "stageSkipped", runId: input.runId, stageId: stageDef.id });
}

async function runGroup(
  ctx: PipelineContext,
  group: PipelineGroup,
  walk: WalkState,
): Promise<boolean> {
  const { run, tasks, input } = ctx;
  const seeded = input.seeded;

  for (const stageDef of group.stages) {
    if (!walk.reached) {
      if (stageDef.id === seeded?.startStageId) {
        walk.reached = true;
      } else {
        await tasks.project.start(run, {
          kind: "applySeededStage",
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

  await tasks.project.start(run, { kind: "runStarted", runId, message: input.startedMessage });

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

  if (deps.isCancelled(runId)) {
    return { status: "cancelled" };
  }

  const status = walk.status;
  if (pipeline.id !== ORCHESTRATION_PIPELINE.id) {
    await tasks.review.start(run, { context: workContext(input), status });
  }

  await tasks.project.start(run, { kind: "runCompleted", runId, status });
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

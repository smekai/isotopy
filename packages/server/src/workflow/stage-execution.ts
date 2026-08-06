import {
  DEFAULT_PERMISSION_MODE,
  ENGINES,
  STAGE_OUTCOMES,
  STAGE_OUTPUT_PROTOCOLS,
  STAGE_VERDICTS,
  agentForStage,
  isConversational,
} from "@adhd/core";
import type {
  EngineId,
  OrchestratorBrokerDecision,
  OrchestratorDecision,
  RunArtifactRecord,
  RunArtifacts,
  RunState,
  StageDefinition,
} from "@adhd/core";
import { config } from "../config.ts";
import { getEngineAdapter } from "../engines/registry.ts";
import type { EngineRunResult } from "../engines/types.ts";
import { buildStagePrompt } from "../domain/markdown/stage.ts";
import type { UpstreamOutput } from "../domain/markdown/stage.ts";
import { interpretEngineResult } from "../domain/rules/stage-context.ts";
import { extractOrchestratorDecision } from "../schemas/orchestrator-decision.ts";
import { extractRunArtifacts } from "../schemas/run-artifacts.ts";
import { formatValidationIssues } from "../domain/validation.ts";
import { loadSkill } from "../services/skills.ts";
import { loadBundledStepTask } from "../services/bundled-prompts.ts";
import { nowIso } from "../utils/time.ts";
import type {
  PipelineWorkflowInput,
  QuestionMediationContext,
  QuestionMediationRequest,
  QuestionMediationResult,
  RunReview,
  RunReviewContext,
  RunReviewRequest,
  StageResult,
  StageTurn,
  WorkflowDeps,
} from "./types.ts";

const UNKNOWN_ENGINE_LABEL = "unknown";

/** Bounds the question loop so a persona that always asks cannot run forever. */
export const MAX_QUESTION_TURNS = 6;

function canAsk(stageDef: StageDefinition, engine: EngineId, turn: number): boolean {
  return (
    stageDef.interactive === true &&
    isConversational(engine) &&
    turn < (stageDef.maxTurns ?? MAX_QUESTION_TURNS)
  );
}

function recordsOutputWhileAsking(stageDef: StageDefinition): boolean {
  return stageDef.outputProtocol === STAGE_OUTPUT_PROTOCOLS.DECISION;
}

function upstreamFor(run: RunState, stageId: string): UpstreamOutput[] {
  const index = run.stages.findIndex((stage) => stage.id === stageId);
  if (index <= 0) {
    return [];
  }
  const outputs = run.stageOutputs ?? {};
  return run.stages
    .slice(0, index)
    .map((stage) => ({ label: stage.label, output: outputs[stage.id] ?? "" }))
    .filter((entry) => entry.output !== "");
}

function engineLabel(run: RunState): string {
  return run.engine ? ENGINES[run.engine].label : UNKNOWN_ENGINE_LABEL;
}

async function runAdapter(
  deps: WorkflowDeps,
  input: PipelineWorkflowInput,
  run: RunState,
  engine: EngineId,
  stageId: string,
  prompt: string,
  persona: string | undefined,
  resumeSessionId: string | undefined,
): Promise<EngineRunResult> {
  const controller = deps.beginEngineStage(run.id);
  try {
    const adapter = getEngineAdapter(engine);
    return await adapter.run({
      runId: run.id,
      prompt,
      cwd: run.workspacePath ?? process.cwd(),
      model: run.model,
      appendSystemPrompt: persona,
      permissionMode: input.permissionMode ?? DEFAULT_PERMISSION_MODE,
      connection: deps.settings.getEngineConnection(run.projectId, engine),
      resumeSessionId,
      timeoutMs: config.engineTimeoutMs,
      signal: controller.signal,
      onLog: (log) => deps.projection.log(run.id, stageId, log),
    });
  } catch (error) {
    return {
      success: false,
      exitCode: null,
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  } finally {
    deps.endEngineStage(run.id);
  }
}

function brokerDecisionError(
  request: QuestionMediationRequest,
  decision: OrchestratorDecision,
): string | undefined {
  if (request.phase === "question") {
    if (decision.action === "answer_agent") {
      return undefined;
    }
    if (decision.action === "escalate_to_user") {
      return decision.originStageId === request.stageId
        ? undefined
        : `Orchestrator escalated for stage "${decision.originStageId}" instead of "${request.stageId}"`;
    }
    return `Orchestrator must answer or escalate the question, not ${decision.action}`;
  }
  if (decision.action !== "route_to_agent") {
    return `Orchestrator must route the user's answer, not ${decision.action}`;
  }
  return decision.stageId === request.stageId
    ? undefined
    : `Orchestrator routed the answer to stage "${decision.stageId}" instead of "${request.stageId}"`;
}

function asBrokerDecision(
  decision: OrchestratorDecision,
): OrchestratorBrokerDecision | undefined {
  return decision.action === "answer_agent" ||
    decision.action === "escalate_to_user" ||
    decision.action === "route_to_agent"
    ? decision
    : undefined;
}

export async function runQuestionMediationWork(
  deps: WorkflowDeps,
  input: PipelineWorkflowInput,
  stageDef: StageDefinition,
  request: QuestionMediationRequest,
  resumeSessionId?: string,
): Promise<QuestionMediationResult> {
  const run = deps.projection.getRun(input.runId);
  if (!run || !run.engine) {
    return {
      outcome: STAGE_OUTCOMES.FAILED,
      failureMessage: "The asking run has no engine for Orchestrator mediation",
    };
  }
  const orchestration = deps.orchestration();
  if (!orchestration) {
    return {
      outcome: STAGE_OUTCOMES.NEEDS_ATTENTION,
      failureMessage: "The project has no registered Orchestrator",
    };
  }
  let context: QuestionMediationContext;
  try {
    context = await orchestration.contextFor(request);
  } catch (error) {
    return {
      outcome: STAGE_OUTCOMES.NEEDS_ATTENTION,
      failureMessage: error instanceof Error ? error.message : String(error),
    };
  }
  const projectPath = deps.registry.resolve(run.projectId);
  const persona = await loadSkill(projectPath, "orchestrator");
  const stepTask = await loadBundledStepTask("mediate-question");
  deps.projection.log(run.id, stageDef.id, {
    level: "run",
    message: `Orchestrator mediating · ${engineLabel(run)}${run.model ? ` · ${run.model}` : ""}`,
    activity: { kind: "engine", name: engineLabel(run) },
  });
  const prompt = buildStagePrompt(context.prompt, [], stepTask);
  const outcome = await runAdapter(
    deps,
    input,
    run,
    run.engine,
    stageDef.id,
    prompt,
    persona,
    resumeSessionId,
  );
  if (outcome.usage) {
    deps.projection.stageUsage(run.id, stageDef.id, outcome.usage);
  }
  if (deps.isCancelled(run.id)) {
    return { outcome: STAGE_OUTCOMES.CANCELLED };
  }
  if (outcome.limit) {
    return { outcome: STAGE_OUTCOMES.LIMITED, limit: outcome.limit };
  }
  if (!outcome.success) {
    return {
      outcome: STAGE_OUTCOMES.FAILED,
      failureMessage: outcome.errorMessage ?? "Orchestrator mediation failed",
    };
  }
  const parsed = extractOrchestratorDecision(outcome.result ?? "");
  if (!parsed.ok) {
    return {
      outcome: STAGE_OUTCOMES.NEEDS_ATTENTION,
      failureMessage: `Orchestrator produced no usable mediation decision — ${formatValidationIssues(parsed.issues)}`,
    };
  }
  const decisionError = brokerDecisionError(request, parsed.value);
  const decision = asBrokerDecision(parsed.value);
  if (decisionError || !decision) {
    return {
      outcome: STAGE_OUTCOMES.NEEDS_ATTENTION,
      failureMessage: decisionError ?? "Orchestrator produced an invalid mediation decision",
    };
  }
  try {
    await orchestration.recordDecision(request, context, decision);
  } catch (error) {
    return {
      outcome: STAGE_OUTCOMES.NEEDS_ATTENTION,
      failureMessage: error instanceof Error ? error.message : String(error),
    };
  }
  return {
    outcome: STAGE_OUTCOMES.PASSED,
    decision,
    sessionId: outcome.sessionId,
  };
}

function reviewRecord(artifacts: RunArtifacts): RunArtifactRecord {
  return { report: artifacts, validationErrors: [], collectedAt: nowIso() };
}

export async function runOrchestratorReviewWork(
  deps: WorkflowDeps,
  input: PipelineWorkflowInput,
  status: RunState["status"],
): Promise<null> {
  const run = deps.projection.getRun(input.runId);
  const orchestration = deps.orchestration();
  const stageId = run?.stages.at(-1)?.id;
  if (!run || !run.engine || !orchestration || stageId === undefined) {
    return null;
  }
  const request: RunReviewRequest = { runId: run.id, status };
  let context: RunReviewContext;
  try {
    context = await orchestration.reviewContextFor(request);
  } catch (error) {
    deps.projection.log(run.id, stageId, {
      level: "warn",
      message: `Orchestrator review skipped — ${messageOf(error)}`,
    });
    return null;
  }
  deps.projection.log(run.id, stageId, {
    level: "run",
    message: `Orchestrator reviewing the run · ${engineLabel(run)}${run.model ? ` · ${run.model}` : ""}`,
    activity: { kind: "engine", name: engineLabel(run) },
  });
  const outcome = await runAdapter(
    deps,
    input,
    run,
    run.engine,
    stageId,
    buildStagePrompt(context.prompt, [], await loadBundledStepTask("review-run")),
    await loadSkill(deps.registry.resolve(run.projectId), "orchestrator"),
    undefined,
  );
  if (outcome.usage) {
    deps.projection.stageUsage(run.id, stageId, outcome.usage);
  }
  if (deps.isCancelled(run.id)) {
    return null;
  }
  const review = readReview(outcome);
  if (review.artifacts) {
    await deps.projection.captureRunArtifacts(run.id, review.artifacts);
  }
  try {
    await orchestration.recordReview(request, context, review);
  } catch (error) {
    deps.projection.log(run.id, stageId, {
      level: "warn",
      message: `Orchestrator review was not recorded — ${messageOf(error)}`,
    });
  }
  return null;
}

function readReview(outcome: EngineRunResult): RunReview {
  if (!outcome.success) {
    return { errors: [outcome.errorMessage ?? "Orchestrator review failed"] };
  }
  const output = outcome.result ?? "";
  const artifacts = extractRunArtifacts(output);
  const decision = extractOrchestratorDecision(output);
  const review: RunReview = {
    errors: [
      ...(artifacts.ok
        ? []
        : [`Run artifacts: ${formatValidationIssues(artifacts.issues)}`]),
      ...(decision.ok
        ? []
        : [`Review decision: ${formatValidationIssues(decision.issues)}`]),
    ],
  };
  if (artifacts.ok) {
    review.artifacts = reviewRecord(artifacts.value);
  }
  if (decision.ok) {
    review.decision = decision.value;
  }
  return review;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function runStageWork(
  deps: WorkflowDeps,
  input: PipelineWorkflowInput,
  stageDef: StageDefinition,
  turn: StageTurn,
): Promise<StageResult> {
  const { projection, registry } = deps;
  const { runId } = input;
  const startedAt = nowIso();
  const run = projection.getRun(runId);
  if (!run || !run.engine) {
    return { outcome: STAGE_OUTCOMES.PASSED, startedAt, completedAt: nowIso() };
  }
  const profession = agentForStage(stageDef.id).profession;
  const resuming = turn.resumeSessionId !== undefined;

  if (resuming) {
    projection.stageAnswered(runId, stageDef.id);
  } else {
    projection.stageStarted(runId, stageDef.id);
    projection.log(runId, stageDef.id, {
      level: "run",
      message: `${profession} online · ${engineLabel(run)}${run.model ? ` · ${run.model}` : ""}`,
      activity: { kind: "engine", name: engineLabel(run) },
    });
  }

  const projectPath = registry.resolve(run.projectId);
  const persona = stageDef.skill ? await loadSkill(projectPath, stageDef.skill) : undefined;
  const stepTask = stageDef.stepTask ? await loadBundledStepTask(stageDef.stepTask) : undefined;
  if (stageDef.skill && !persona) {
    projection.log(runId, stageDef.id, {
      level: "warn",
      message: `No skill "${stageDef.skill}" found — running without a persona`,
    });
  }
  if (stageDef.stepTask && !stepTask) {
    projection.log(runId, stageDef.id, {
      level: "warn",
      message: `No step task "${stageDef.stepTask}" found — running without assignment instructions`,
    });
  }
  const prompt = resuming
    ? (turn.answer ?? "")
    : buildStagePrompt(input.task ?? "", upstreamFor(run, stageDef.id), stepTask);

  if (deps.isCancelled(runId)) {
    return { outcome: STAGE_OUTCOMES.CANCELLED, startedAt, completedAt: nowIso() };
  }

  const outcome = await runAdapter(
    deps,
    input,
    run,
    run.engine,
    stageDef.id,
    prompt,
    persona,
    turn.resumeSessionId,
  );

  if (outcome.usage) {
    projection.stageUsage(runId, stageDef.id, outcome.usage);
  }

  if (deps.isCancelled(runId)) {
    return { outcome: STAGE_OUTCOMES.CANCELLED, startedAt, completedAt: nowIso() };
  }

  const decision = interpretEngineResult(outcome, {
    profession,
    canAsk: canAsk(stageDef, run.engine, turn.index),
    protocol: stageDef.outputProtocol,
  });

  if (decision.outcome === STAGE_OUTCOMES.LIMITED && decision.limit !== undefined) {
    return {
      outcome: STAGE_OUTCOMES.LIMITED,
      limit: decision.limit,
      startedAt,
      completedAt: nowIso(),
    };
  }

  if (decision.outcome === STAGE_OUTCOMES.ASKING && decision.question !== undefined) {
    if (recordsOutputWhileAsking(stageDef) && decision.output !== undefined) {
      await projection.captureStageOutput(runId, stageDef, decision.output);
    }
    return {
      outcome: STAGE_OUTCOMES.ASKING,
      question: decision.question,
      sessionId: outcome.sessionId,
      startedAt,
      completedAt: nowIso(),
    };
  }

  if (decision.output !== undefined) {
    await projection.captureStageOutput(runId, stageDef, decision.output);
  }
  if (decision.verdict !== undefined) {
    projection.setVerdict(runId, stageDef.id, decision.verdict);
  }

  if (
    decision.outcome === STAGE_OUTCOMES.FAILED ||
    decision.outcome === STAGE_OUTCOMES.NEEDS_ATTENTION
  ) {
    projection.stageFailed(runId, stageDef.id, decision.failureMessage ?? `${profession} failed`);
  } else if (decision.outcome === STAGE_OUTCOMES.SKIPPED) {
    projection.log(runId, stageDef.id, { level: "warn", message: `${profession} reported VERDICT: SKIP` });
    projection.stageSkipped(runId, stageDef.id);
  } else {
    if (decision.verdict === STAGE_VERDICTS.PASS) {
      projection.log(runId, stageDef.id, { level: "pass", message: `${profession} reported VERDICT: PASS` });
    }
    if (!stageDef.gateAfter) {
      projection.log(runId, stageDef.id, { level: "pass", message: `✓ ${profession} finished — result ready` });
      projection.stagePassed(runId, stageDef.id);
    }
  }

  return {
    outcome:
      decision.outcome === STAGE_OUTCOMES.ASKING
        ? STAGE_OUTCOMES.PASSED
        : decision.outcome,
    output: decision.output,
    verdict: decision.verdict,
    sessionId: outcome.sessionId,
    startedAt,
    completedAt: nowIso(),
  };
}

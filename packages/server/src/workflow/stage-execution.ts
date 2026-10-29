import { mkdir } from "node:fs/promises";
import {
  DEFAULT_PERMISSION_MODE,
  ORCHESTRATION_PIPELINE,
  isReleaseRun,
  STAGE_OUTCOMES,
  STAGE_OUTPUT_PROTOCOLS,
  STAGE_VERDICTS,
  stageTitleIn,
  resolveTier,
} from "@isotopy/core";
import type {
  DeploymentAutomation,
  EffortLevel,
  OrchestratorBrokerDecision,
  OrchestratorDecision,
  RunCloseoutRecord,
  RunArtifacts,
  RunState,
  StageDefinition,
  StageVerdict,
} from "@isotopy/core";
import { config } from "../config.ts";
import { getEngineAdapter } from "../engines/registry.ts";
import type { EngineRunResult } from "../engines/types.ts";
import { buildProductEnvironment } from "../domain/markdown/product-environment.ts";
import { buildWaitRule } from "../domain/markdown/stage-wait.ts";
import {
  buildArtifactsRule,
  buildCommitRule,
  buildIsolatedReviewRule,
  buildContinuationPrompt,
  buildProcessRule,
  buildResumePrompt,
  buildStagePrompt,
  buildTimeBudget,
} from "../domain/markdown/stage.ts";
import { engineLabel, engineWithModel } from "../domain/rules/engine-label.ts";
import { secondaryFallbackNote } from "../domain/rules/stage-engines.ts";
import { seesHandoffs, upstreamFor } from "../domain/rules/review-context.ts";
import type { StageEngine } from "../domain/rules/stage-engines.ts";
import { interpretEngineResult } from "../domain/rules/stage-context.ts";
import type { EngineStageOutcome } from "../domain/rules/stage-context.ts";
import { extractOrchestratorContext } from "../schemas/orchestrator-context.ts";
import { extractOrchestratorDecision } from "../schemas/orchestrator-decision.ts";
import { extractRunArtifacts } from "../schemas/run-artifacts.ts";
import { formatValidationIssues } from "../domain/validation.ts";
import { renderReviewRepair } from "../domain/markdown/orchestration.ts";
import { runArtifactsDir, toolCacheDir } from "../paths.ts";
import { capturePersonaNotes } from "../services/persona-notes-store.ts";
import { persistReviewOutput } from "../services/run-evidence.ts";
import { messageOf } from "../utils/message-of.ts";
import { toPosixPath } from "../utils/posix-path.ts";
import { nowIso } from "../utils/time.ts";
import type {
  StageWorkContext,
  QuestionMediationContext,
  QuestionMediationRequest,
  QuestionMediationResult,
  RunProjection,
  RunReview,
  RunReviewContext,
  RunReviewRequest,
  StageResult,
  StageTurn,
  WorkflowDeps,
} from "./types.ts";

/** Bounds the question loop so a persona that always asks cannot run forever. */
export const MAX_QUESTION_TURNS = 6;

function canAsk(stageDef: StageDefinition, turn: number): boolean {
  return stageDef.interactive === true && turn < (stageDef.maxTurns ?? MAX_QUESTION_TURNS);
}

function recordsOutputWhileAsking(stageDef: StageDefinition): boolean {
  return stageDef.outputProtocol === STAGE_OUTPUT_PROTOCOLS.DECISION;
}

function turnPrompt(
  input: StageWorkContext,
  run: RunState,
  stageDef: StageDefinition,
  turn: StageTurn,
  stepTask: string | undefined,
  environment: string | undefined,
): string {
  const task = input.task ?? "";
  if (turn.resumeSessionId !== undefined) {
    return turn.answer ?? buildResumePrompt(task, stepTask, environment);
  }
  const upstream = upstreamFor(run, stageDef);
  return turn.exchanges === undefined || turn.exchanges.length === 0
    ? buildStagePrompt(task, upstream, stepTask, environment)
    : buildContinuationPrompt({ task, upstream, exchanges: turn.exchanges, stepTask, environment });
}

export const VERIFY_FEATURE_STEP_TASK = "verify-feature";

async function stageEnvironment(
  deps: WorkflowDeps,
  run: RunState,
  stageDef: StageDefinition,
): Promise<string> {
  const product = await productEnvironment(deps, run, stageDef);
  return [
    buildTimeBudget(config.engineTimeoutMs),
    buildProcessRule({ pid: process.pid, port: config.port }),
    ...(await teamWorkRules(deps, run)),
    isolatedReviewRule(run, stageDef),
    product,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function isolatedReviewRule(run: RunState, stageDef: StageDefinition): string | undefined {
  return run.branch === undefined || seesHandoffs(run, stageDef)
    ? undefined
    : buildIsolatedReviewRule(run.branch);
}

async function teamWorkRules(deps: WorkflowDeps, run: RunState): Promise<string[]> {
  if (run.pipelineId === ORCHESTRATION_PIPELINE.id) {
    return [];
  }
  const artifacts = runArtifactsDir(deps.registry.resolve(run.projectId), run.id);
  await mkdir(artifacts, { recursive: true });
  const artifactsRule = buildArtifactsRule(toPosixPath(artifacts));
  const waitRule = buildWaitRule(config.waitMinIntervalMs);
  return run.branch === undefined
    ? [artifactsRule, waitRule]
    : [artifactsRule, buildCommitRule(run.branch), waitRule];
}

async function productEnvironment(
  deps: WorkflowDeps,
  run: RunState,
  stageDef: StageDefinition,
): Promise<string | undefined> {
  if (stageDef.stepTask !== VERIFY_FEATURE_STEP_TASK) {
    return undefined;
  }
  const project = deps.registry.resolve(run.projectId);
  if ((await deps.automation.get(project)).ui === undefined) {
    return undefined;
  }
  return buildProductEnvironment({
    apiBaseUrl: `http://localhost:${config.port}`,
    projectId: run.projectId,
    runningUrl: deps.product?.urlFor(run.projectId),
  });
}


export const PREVIEW_DEPLOY_STEP_TASK = "deploy-preview";

function isDeterministicPreviewDeploy(stageDef: StageDefinition, turn: StageTurn): boolean {
  return stageDef.stepTask === PREVIEW_DEPLOY_STEP_TASK && turn.index === 0;
}

async function previewTarget(
  deps: WorkflowDeps,
  run: RunState,
): Promise<DeploymentAutomation | undefined> {
  return (await deps.automation.get(deps.registry.resolve(run.projectId))).preview;
}

async function runPreviewDeployment(
  deps: WorkflowDeps,
  run: RunState,
  stageDef: StageDefinition,
  startedAt: string,
): Promise<StageResult> {
  const { projection } = deps;
  projection.stageStarted(run.id, stageDef.id);
  projection.log(run.id, stageDef.id, {
    level: "run",
    message: `${stageTitleIn(run, stageDef.id)} deploying the preview from project automation`,
  });

  let target: DeploymentAutomation | undefined;
  try {
    target = await previewTarget(deps, run);
  } catch (error) {
    return failedDeployment(deps, run, stageDef, startedAt, messageOf(error));
  }

  if (target === undefined) {
    projection.log(run.id, stageDef.id, {
      level: "warn",
      message: "No preview deployment target is configured — nothing to deploy",
    });
    projection.setVerdict(run.id, stageDef.id, STAGE_VERDICTS.SKIP);
    projection.stageSkipped(run.id, stageDef.id);
    return {
      outcome: STAGE_OUTCOMES.SKIPPED,
      verdict: STAGE_VERDICTS.SKIP,
      startedAt,
      completedAt: nowIso(),
    };
  }

  const controller = deps.beginEngineStage(run.id);
  const logLines: string[] = [];
  try {
    const result = await deps.deployment.run({
      project: deps.registry.resolve(run.projectId),
      environment: "preview",
      target,
      signal: controller.signal,
      onLine: (stream, line) => {
        logLines.push(`[${stream}] ${line}`);
        projection.log(run.id, stageDef.id, {
          level: stream === "stderr" ? "warn" : "info",
          message: line,
        });
      },
    });
    if (deps.isCancelled(run.id)) {
      return { outcome: STAGE_OUTCOMES.CANCELLED, startedAt, completedAt: nowIso() };
    }
    await projection.captureDeployment(run.id, stageDef, result, logLines);
    if (result.verdict === "fail") {
      return failedDeployment(
        deps,
        run,
        stageDef,
        startedAt,
        result.failureMessage ?? "Preview deployment failed",
        STAGE_VERDICTS.FAIL,
      );
    }
    projection.setVerdict(run.id, stageDef.id, STAGE_VERDICTS.PASS);
    projection.log(run.id, stageDef.id, {
      level: "pass",
      message: result.url === undefined
        ? "Preview deployment verified"
        : `Preview deployment verified — ${result.url}`,
    });
    projection.stagePassed(run.id, stageDef.id);
    return {
      outcome: STAGE_OUTCOMES.PASSED,
      verdict: STAGE_VERDICTS.PASS,
      startedAt,
      completedAt: nowIso(),
    };
  } catch (error) {
    return failedDeployment(deps, run, stageDef, startedAt, messageOf(error));
  } finally {
    deps.endEngineStage(run.id);
  }
}

function failedDeployment(
  deps: WorkflowDeps,
  run: RunState,
  stageDef: StageDefinition,
  startedAt: string,
  message: string,
  verdict?: StageVerdict,
): StageResult {
  if (verdict !== undefined) {
    deps.projection.setVerdict(run.id, stageDef.id, verdict);
  }
  deps.projection.stageFailed(run.id, stageDef.id, message);
  return {
    outcome: STAGE_OUTCOMES.FAILED,
    verdict,
    startedAt,
    completedAt: nowIso(),
  };
}

async function runAdapter(
  deps: WorkflowDeps,
  input: StageWorkContext,
  run: RunState,
  target: StageEngine,
  stageId: string,
  prompt: string,
  persona: string | undefined,
  resumeSessionId: string | undefined,
): Promise<EngineRunResult> {
  const { engine } = target;
  const controller = deps.beginEngineStage(run.id);
  try {
    const adapter = getEngineAdapter(engine);
    const selection = await selectModel(deps, run, stageId, target);
    const cwd = run.workspacePath ?? process.cwd();
    return await adapter.run({
      runId: run.id,
      prompt,
      cwd,
      ...selection,
      appendSystemPrompt: persona,
      permissionMode: input.permissionMode ?? DEFAULT_PERMISSION_MODE,
      connection: deps.settings.getEngineConnection(run.projectId, engine),
      resumeSessionId,
      toolCacheDir: toolCacheDir(deps.registry.resolve(run.projectId), cwd),
      timeoutMs: config.engineTimeoutMs,
      signal: controller.signal,
      onLog: (log) => deps.projection.log(run.id, stageId, log),
    });
  } catch (error) {
    return {
      success: false,
      exitCode: null,
      errorMessage: messageOf(error),
    };
  } finally {
    deps.endEngineStage(run.id);
  }
}

interface ModelSelection {
  model?: string;
  effort?: EffortLevel;
}

async function selectModel(
  deps: WorkflowDeps,
  run: RunState,
  stageId: string,
  { engine, model }: StageEngine,
): Promise<ModelSelection> {
  if (model !== undefined) {
    return { model };
  }
  const tier = run.stages.find((stage) => stage.id === stageId)?.modelTier ?? run.modelTier;
  if (tier === undefined) {
    return {};
  }
  const resolved = resolveTier(engine, tier, await deps.rosters.roster(engine));
  return {
    model: resolved.model,
    effort: resolved.effort,
  };
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
  input: StageWorkContext,
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
      failureMessage: messageOf(error),
    };
  }
  const projectPath = deps.registry.resolve(run.projectId);
  const persona = await deps.agents.persona(projectPath, "orchestrator");
  const stepTask = await deps.agents.stepTask(projectPath, "mediate-question");
  deps.projection.log(run.id, stageDef.id, {
    level: "run",
    message: `Orchestrator mediating · ${engineWithModel(run.engine, run.model)}`,
    activity: { kind: "engine", name: engineLabel(run.engine) },
  });
  const prompt = buildStagePrompt(context.prompt, [], stepTask);
  const outcome = await runAdapter(
    deps,
    input,
    run,
    { engine: run.engine, model: run.model },
    stageDef.id,
    prompt,
    persona?.text,
    resumeSessionId,
  );
  if (outcome.usage) {
    await orchestration.recordDecisionUsage(context.orchestrationId, outcome.usage);
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
      failureMessage: messageOf(error),
    };
  }
  return {
    outcome: STAGE_OUTCOMES.PASSED,
    decision,
    sessionId: outcome.sessionId,
  };
}

function reviewRecord(artifacts: RunArtifacts): RunCloseoutRecord {
  return {
    report: { ...artifacts, tasks: [], completedTaskIds: [], unresolvedTaskIds: [], cleanup: [] },
    createdTasks: [],
    cleanup: { removed: [], rejected: [] },
    validationErrors: [],
    completedAt: nowIso(),
  };
}


function isMergedRelease(run: RunState, status: RunState["status"]): boolean {
  return isReleaseRun(run) && status === "completed";
}

export async function runOrchestratorReviewWork(
  deps: WorkflowDeps,
  input: StageWorkContext,
  status: RunState["status"],
): Promise<null> {
  const run = deps.projection.getRun(input.runId);
  const orchestration = deps.orchestration();
  const stageId = run?.stages.at(-1)?.id;
  if (
    !run ||
    !run.engine ||
    !orchestration ||
    stageId === undefined ||
    isMergedRelease(run, status)
  ) {
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
    message: `Orchestrator reviewing the run · ${engineWithModel(run.engine, run.model)}`,
    activity: { kind: "engine", name: engineLabel(run.engine) },
  });
  const projectPath = deps.registry.resolve(run.projectId);
  const prompt = buildStagePrompt(
    context.prompt,
    [],
    await deps.agents.stepTask(projectPath, "review-run"),
  );
  const persona = (await deps.agents.persona(projectPath, "orchestrator"))?.text;
  const engine = { engine: run.engine, model: run.model };
  const reviewTurn = async (turnPrompt: string, resumeSessionId?: string) => {
    const outcome = await runAdapter(deps, input, run, engine, stageId, turnPrompt, persona, resumeSessionId);
    if (outcome.usage) {
      await orchestration.recordDecisionUsage(context.orchestrationId, outcome.usage);
    }
    return outcome;
  };
  const outcome = await reviewTurn(prompt);
  if (deps.isCancelled(run.id)) {
    return null;
  }
  const output = outcome.result ?? outcome.errorMessage ?? "";
  await persistReviewOutput(projectPath, run.id, REVIEW_OUTPUT_FILE, output);
  const closedOut = deps.projection.getRun(run.id)?.closeout !== undefined;
  let review = readReview(outcome, output, !closedOut);
  if (outcome.success && review.errors.length > 0) {
    deps.projection.log(run.id, stageId, {
      level: "warn",
      message: `Orchestrator review could not be acted on, asking once for a repair — ${review.errors.join("; ")}`,
    });
    const repair = await reviewTurn(
      renderReviewRepair({
        errors: review.errors,
        replay: outcome.sessionId === undefined ? { prompt, answer: output } : undefined,
      }),
      outcome.sessionId,
    );
    if (deps.isCancelled(run.id)) {
      return null;
    }
    const repairOutput = repair.result ?? repair.errorMessage ?? "";
    await persistReviewOutput(projectPath, run.id, REVIEW_REPAIR_FILE, repairOutput);
    review = repair.success
      ? readReview(repair, `${repairOutput}\n\n${output}`, !closedOut)
      : { ...review, errors: [...review.errors, repair.errorMessage ?? "The review repair failed"] };
  }
  if (!closedOut && review.artifacts) {
    await deps.projection.captureRunCloseout(run.id, review.artifacts);
  }
  try {
    const recorded = await orchestration.recordReview(request, context, review);
    if (recorded.contextRefusal !== undefined) {
      deps.projection.log(run.id, stageId, { level: "warn", message: recorded.contextRefusal });
    }
  } catch (error) {
    deps.projection.log(run.id, stageId, {
      level: "warn",
      message: `Orchestrator review was not recorded — ${messageOf(error)}`,
    });
  }
  return null;
}

const REVIEW_OUTPUT_FILE = "output.md";

const REVIEW_REPAIR_FILE = "repair.md";

function readReview(outcome: EngineRunResult, output: string, artifactsExpected: boolean): RunReview {
  if (!outcome.success) {
    return { errors: [outcome.errorMessage ?? "Orchestrator review failed"] };
  }
  const artifacts = extractRunArtifacts(output);
  const decision = extractOrchestratorDecision(output);
  const review: RunReview = {
    contextRevision: extractOrchestratorContext(output),
    errors: [
      ...(artifacts.ok || !artifactsExpected
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

function stageEngineOf(run: RunState, stageId: string): StageEngine | undefined {
  const stage = run.stages.find((candidate) => candidate.id === stageId);
  return stage?.engine === undefined ? undefined : { engine: stage.engine, model: stage.model };
}

function logStageOnline(
  deps: WorkflowDeps,
  run: RunState,
  stageDef: StageDefinition,
  profession: string,
  target: StageEngine,
): void {
  deps.projection.log(run.id, stageDef.id, {
    level: "run",
    message: `${profession} online · ${engineWithModel(target.engine, target.model)}`,
    activity: { kind: "engine", name: engineLabel(target.engine) },
  });
  const fallback = run.engine && secondaryFallbackNote(stageDef, run.secondaryEngine, run.engine);
  if (fallback) {
    deps.projection.log(run.id, stageDef.id, { level: "warn", message: fallback });
  }
  if (stageDef.context === "isolated" && run.reviewContextGrant !== undefined) {
    deps.projection.log(run.id, stageDef.id, {
      level: "info",
      message: `The Orchestrator granted the earlier handoffs: ${run.reviewContextGrant.rationale}`,
    });
  }
}

export async function runStageWork(
  deps: WorkflowDeps,
  input: StageWorkContext,
  stageDef: StageDefinition,
  turn: StageTurn,
): Promise<StageResult> {
  const { projection, registry } = deps;
  const { runId } = input;
  const startedAt = nowIso();
  const run = projection.getRun(runId);
  if (!run) {
    return { outcome: STAGE_OUTCOMES.PASSED, startedAt, completedAt: nowIso() };
  }
  if (isDeterministicPreviewDeploy(stageDef, turn)) {
    return runPreviewDeployment(deps, run, stageDef, startedAt);
  }
  const target = stageEngineOf(run, stageDef.id);
  if (!run.engine || !target) {
    return { outcome: STAGE_OUTCOMES.PASSED, startedAt, completedAt: nowIso() };
  }
  const profession = stageTitleIn(run, stageDef.id);
  const continuing = turn.index > 0;

  if (continuing) {
    projection.stageAnswered(runId, stageDef.id);
  } else {
    projection.stageStarted(runId, stageDef.id);
    logStageOnline(deps, run, stageDef, profession, target);
  }

  const projectPath = registry.resolve(run.projectId);
  const persona = stageDef.skill
    ? await deps.agents.persona(projectPath, stageDef.skill)
    : undefined;
  const stepTask = stageDef.stepTask
    ? await deps.agents.stepTask(projectPath, stageDef.stepTask)
    : undefined;
  if (stageDef.skill && !persona) {
    projection.log(runId, stageDef.id, {
      level: "warn",
      message: `No skill "${stageDef.skill}" found — running without a persona`,
    });
  }
  for (const warning of persona?.warnings ?? []) {
    projection.log(runId, stageDef.id, { level: "warn", message: warning });
  }
  if (stageDef.stepTask && !stepTask) {
    projection.log(runId, stageDef.id, {
      level: "warn",
      message: `No step task "${stageDef.stepTask}" found — running without assignment instructions`,
    });
  }
  const environment = await stageEnvironment(deps, run, stageDef);
  const prompt = turnPrompt(input, run, stageDef, turn, stepTask, environment);

  if (deps.isCancelled(runId)) {
    return { outcome: STAGE_OUTCOMES.CANCELLED, startedAt, completedAt: nowIso() };
  }

  const outcome = await runAdapter(
    deps,
    input,
    run,
    target,
    stageDef.id,
    prompt,
    persona?.text,
    turn.resumeSessionId,
  );

  if (outcome.usage) {
    projection.stageUsage(runId, stageDef.id, outcome.usage);
  }
  if (outcome.sessionId !== undefined) {
    projection.stageSession(runId, stageDef.id, outcome.sessionId);
  }

  if (deps.isCancelled(runId)) {
    return { outcome: STAGE_OUTCOMES.CANCELLED, startedAt, completedAt: nowIso() };
  }

  const decision = interpretEngineResult(outcome, {
    profession,
    canAsk: canAsk(stageDef, turn.index),
    protocol: stageDef.outputProtocol,
    waitMinIntervalMs: config.waitMinIntervalMs,
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

  if (decision.outcome === STAGE_OUTCOMES.WAITING && decision.wait !== undefined) {
    return {
      outcome: STAGE_OUTCOMES.WAITING,
      wait: decision.wait,
      output: decision.output,
      sessionId: outcome.sessionId,
      startedAt,
      completedAt: nowIso(),
    };
  }

  const reported = await withNotesRemoved(deps, run, stageDef, decision);
  const settled = await settleStageOutput(projection, runId, stageDef, reported);
  if (settled.verdict !== undefined) {
    projection.setVerdict(runId, stageDef.id, settled.verdict);
  }

  if (
    settled.outcome === STAGE_OUTCOMES.FAILED ||
    settled.outcome === STAGE_OUTCOMES.NEEDS_ATTENTION
  ) {
    projection.stageFailed(runId, stageDef.id, settled.failureMessage ?? `${profession} failed`);
  } else if (settled.outcome === STAGE_OUTCOMES.SKIPPED) {
    projection.log(runId, stageDef.id, { level: "warn", message: `${profession} reported VERDICT: SKIP` });
    projection.stageSkipped(runId, stageDef.id);
  } else {
    if (settled.verdict === STAGE_VERDICTS.PASS) {
      projection.log(runId, stageDef.id, { level: "pass", message: `${profession} reported VERDICT: PASS` });
    }
    if (!stageDef.gateAfter) {
      projection.log(runId, stageDef.id, { level: "pass", message: `✓ ${profession} finished — result ready` });
      projection.stagePassed(runId, stageDef.id);
    }
  }

  return {
    outcome:
      settled.outcome === STAGE_OUTCOMES.ASKING
        ? STAGE_OUTCOMES.PASSED
        : settled.outcome,
    output: settled.output,
    verdict: settled.verdict,
    sessionId: outcome.sessionId,
    startedAt,
    completedAt: nowIso(),
  };
}

async function withNotesRemoved(
  deps: WorkflowDeps,
  run: RunState,
  stageDef: StageDefinition,
  decision: EngineStageOutcome,
): Promise<EngineStageOutcome> {
  if (decision.output === undefined) {
    return decision;
  }
  const capture = await capturePersonaNotes(
    deps.registry.resolve(run.projectId),
    stageDef.skill,
    decision.output,
  ).catch((error: unknown) => ({
    report: decision.output ?? "",
    issue: messageOf(error),
  }));
  if (capture.issue !== undefined) {
    deps.projection.log(run.id, stageDef.id, {
      level: "warn",
      message: `Notes for the next run were not saved — ${capture.issue}`,
    });
  }
  return { ...decision, output: capture.report };
}

async function settleStageOutput(
  projection: RunProjection,
  runId: string,
  stageDef: StageDefinition,
  decision: EngineStageOutcome,
): Promise<EngineStageOutcome> {
  const passing = decision.outcome === STAGE_OUTCOMES.PASSED;
  const output = decision.output ?? (passing ? "" : undefined);
  if (output === undefined) {
    return decision;
  }
  const rejection = await projection.captureStageOutput(runId, stageDef, output);
  if (!passing || !rejection) {
    return decision;
  }
  return {
    ...decision,
    outcome: STAGE_OUTCOMES.NEEDS_ATTENTION,
    failureMessage: rejection.reason,
  };
}

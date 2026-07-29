import {
  DEFAULT_PERMISSION_MODE,
  ENGINES,
  STAGE_OUTCOMES,
  STAGE_VERDICTS,
  agentForStage,
  isConversational,
} from "@adhd/core";
import type { EngineId, RunState, StageDefinition } from "@adhd/core";
import { config } from "../config.ts";
import { getEngineAdapter } from "../engines/registry.ts";
import type { EngineRunResult } from "../engines/types.ts";
import { buildStagePrompt } from "../domain/markdown/stage.ts";
import type { UpstreamOutput } from "../domain/markdown/stage.ts";
import { interpretEngineResult } from "../domain/stage-context.ts";
import { loadSkill } from "../services/skills.ts";
import { loadStepTask } from "../services/step-tasks.ts";
import { nowIso } from "../utils.ts";
import type {
  PipelineWorkflowInput,
  StageResult,
  StageTurn,
  WorkflowDeps,
} from "./types.ts";

const UNKNOWN_ENGINE_LABEL = "unknown";

/** Bounds the question loop so a persona that always asks cannot run forever. */
export const MAX_QUESTION_TURNS = 6;

function canAsk(stageDef: StageDefinition, engine: EngineId, turn: number): boolean {
  return (
    stageDef.interactive === true && isConversational(engine) && turn < MAX_QUESTION_TURNS
  );
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

async function runPreviewDeployment(
  deps: WorkflowDeps,
  run: RunState,
  stageDef: StageDefinition,
  startedAt: string,
): Promise<StageResult> {
  const { projection } = deps;
  projection.stageStarted(run.id, stageDef.id);
  projection.log(run.id, stageDef.id, "run", "SRE preview automation online");

  let target;
  try {
    target = (await deps.automation.get(deps.registry.resolve(run.projectId))).preview;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not read deployment configuration";
    projection.stageFailed(run.id, stageDef.id, message);
    return {
      outcome: STAGE_OUTCOMES.FAILED,
      startedAt,
      completedAt: nowIso(),
    };
  }

  if (target === null) {
    projection.log(
      run.id,
      stageDef.id,
      "warn",
      "No preview deployment target is configured",
    );
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
        projection.log(
          run.id,
          stageDef.id,
          stream === "stderr" ? "warn" : "info",
          line,
        );
      },
    });
    if (deps.isCancelled(run.id)) {
      return {
        outcome: STAGE_OUTCOMES.CANCELLED,
        startedAt,
        completedAt: nowIso(),
      };
    }

    await projection.captureDeployment(run.id, stageDef, result, logLines);
    const verdict =
      result.verdict === "pass" ? STAGE_VERDICTS.PASS : STAGE_VERDICTS.FAIL;
    projection.setVerdict(run.id, stageDef.id, verdict);
    if (result.verdict === "pass") {
      projection.log(run.id, stageDef.id, "pass", "Preview deployment verified");
      projection.stagePassed(run.id, stageDef.id);
      return {
        outcome: STAGE_OUTCOMES.PASSED,
        verdict,
        startedAt,
        completedAt: nowIso(),
      };
    }

    projection.stageFailed(
      run.id,
      stageDef.id,
      result.failureMessage ?? "Preview deployment failed",
    );
    return {
      outcome: STAGE_OUTCOMES.FAILED,
      verdict,
      startedAt,
      completedAt: nowIso(),
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Preview deployment failed";
    projection.stageFailed(run.id, stageDef.id, message);
    return {
      outcome: STAGE_OUTCOMES.FAILED,
      startedAt,
      completedAt: nowIso(),
    };
  } finally {
    deps.endEngineStage(run.id);
  }
}

export async function runStageWork(
  deps: WorkflowDeps,
  input: PipelineWorkflowInput,
  stageDef: StageDefinition,
  turn: StageTurn,
): Promise<StageResult> {
  const { projection, registry, settings } = deps;
  const { runId } = input;
  const startedAt = nowIso();
  const run = projection.getRun(runId);
  if (!run || !run.engine) {
    return { outcome: STAGE_OUTCOMES.PASSED, startedAt, completedAt: nowIso() };
  }
  if (
    input.pipeline.id === "full-delivery" &&
    stageDef.id === "deploy" &&
    turn.index === 0
  ) {
    return runPreviewDeployment(deps, run, stageDef, startedAt);
  }
  const profession = agentForStage(stageDef.id).profession;
  const resuming = turn.resumeSessionId !== undefined;

  if (resuming) {
    projection.stageAnswered(runId, stageDef.id);
  } else {
    projection.stageStarted(runId, stageDef.id);
    projection.log(
      runId,
      stageDef.id,
      "run",
      `${profession} online · ${engineLabel(run)}${run.model ? ` · ${run.model}` : ""}`,
    );
  }

  const controller = deps.beginEngineStage(runId);
  const projectPath = registry.resolve(run.projectId);
  const persona = stageDef.skill ? await loadSkill(projectPath, stageDef.skill) : undefined;
  const stepTask = stageDef.stepTask ? await loadStepTask(stageDef.stepTask) : undefined;
  if (stageDef.skill && !persona) {
    projection.log(
      runId,
      stageDef.id,
      "warn",
      `No skill "${stageDef.skill}" found — running without a persona`,
    );
  }
  if (stageDef.stepTask && !stepTask) {
    projection.log(
      runId,
      stageDef.id,
      "warn",
      `No step task "${stageDef.stepTask}" found — running without assignment instructions`,
    );
  }
  const prompt = resuming
    ? (turn.answer ?? "")
    : buildStagePrompt(input.task ?? "", upstreamFor(run, stageDef.id), stepTask);

  if (deps.isCancelled(runId)) {
    deps.endEngineStage(runId);
    return { outcome: STAGE_OUTCOMES.CANCELLED, startedAt, completedAt: nowIso() };
  }

  let outcome: EngineRunResult;
  try {
    const adapter = getEngineAdapter(run.engine);
    outcome = await adapter.run({
      runId,
      prompt,
      cwd: run.workspacePath ?? process.cwd(),
      model: run.model,
      appendSystemPrompt: persona,
      permissionMode: input.permissionMode ?? DEFAULT_PERMISSION_MODE,
      connection: settings.getEngineConnection(run.projectId, run.engine),
      resumeSessionId: turn.resumeSessionId,
      timeoutMs: config.engineTimeoutMs,
      signal: controller.signal,
      onLog: (level, message) => projection.log(runId, stageDef.id, level, message),
    });
  } catch (error) {
    outcome = {
      success: false,
      exitCode: null,
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  } finally {
    deps.endEngineStage(runId);
  }

  if (outcome.usage) {
    projection.stageUsage(runId, stageDef.id, outcome.usage);
  }

  if (deps.isCancelled(runId)) {
    return { outcome: STAGE_OUTCOMES.CANCELLED, startedAt, completedAt: nowIso() };
  }

  const decision = interpretEngineResult(outcome, {
    profession,
    canAsk: canAsk(stageDef, run.engine, turn.index),
  });

  if (decision.outcome === STAGE_OUTCOMES.ASKING && decision.question !== undefined) {
    projection.stageAsking(runId, stageDef.id, decision.question);
    return {
      outcome: STAGE_OUTCOMES.ASKING,
      question: decision.question,
      sessionId: outcome.sessionId,
      startedAt,
      completedAt: nowIso(),
    };
  }

  let validationErrors: string[] = [];
  if (decision.output !== undefined) {
    validationErrors = await projection.captureStageOutput(
      runId,
      stageDef,
      decision.output,
    );
  }
  if (validationErrors.length > 0) {
    validationErrors.forEach((message) =>
      projection.log(runId, stageDef.id, "fail", message),
    );
    projection.setVerdict(runId, stageDef.id, STAGE_VERDICTS.FAIL);
    projection.stageFailed(runId, stageDef.id, "Release handoff is invalid");
    return {
      outcome: STAGE_OUTCOMES.NEEDS_ATTENTION,
      output: decision.output,
      verdict: STAGE_VERDICTS.FAIL,
      sessionId: outcome.sessionId,
      startedAt,
      completedAt: nowIso(),
    };
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
    projection.log(runId, stageDef.id, "warn", `${profession} reported VERDICT: SKIP`);
    projection.stageSkipped(runId, stageDef.id);
  } else {
    if (decision.verdict === STAGE_VERDICTS.PASS) {
      projection.log(runId, stageDef.id, "pass", `${profession} reported VERDICT: PASS`);
    }
    if (!stageDef.gateAfter) {
      projection.log(runId, stageDef.id, "pass", `✓ ${profession} finished — result ready`);
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

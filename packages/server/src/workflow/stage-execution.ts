import { DEFAULT_PERMISSION_MODE, ENGINES, agentForStage, isConversational } from "@adhd/core";
import type { EngineId, RunState, StageDefinition } from "@adhd/core";
import { config } from "../config.ts";
import { getEngineAdapter } from "../engines/registry.ts";
import type { EngineRunResult } from "../engines/types.ts";
import { buildStagePrompt, interpretEngineResult } from "../domain/stage-context.ts";
import type { UpstreamOutput } from "../domain/stage-context.ts";
import { loadSkill } from "../services/skills.ts";
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
    return { outcome: "passed", startedAt, completedAt: nowIso() };
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
  if (stageDef.skill && !persona) {
    projection.log(
      runId,
      stageDef.id,
      "warn",
      `No skill "${stageDef.skill}" found — running without a persona`,
    );
  }
  const prompt = resuming
    ? (turn.answer ?? "")
    : buildStagePrompt(input.task ?? "", upstreamFor(run, stageDef.id));

  if (deps.isCancelled(runId)) {
    deps.endEngineStage(runId);
    return { outcome: "cancelled", startedAt, completedAt: nowIso() };
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
    return { outcome: "cancelled", startedAt, completedAt: nowIso() };
  }

  const decision = interpretEngineResult(outcome, {
    profession,
    canAsk: canAsk(stageDef, run.engine, turn.index),
  });

  if (decision.outcome === "asking" && decision.question !== undefined) {
    projection.stageAsking(runId, stageDef.id, decision.question);
    return {
      outcome: "asking",
      question: decision.question,
      ...(outcome.sessionId !== undefined ? { sessionId: outcome.sessionId } : {}),
      startedAt,
      completedAt: nowIso(),
    };
  }

  if (decision.output !== undefined) {
    projection.captureStageOutput(runId, stageDef, decision.output);
  }
  if (decision.verdict !== undefined) {
    projection.setVerdict(runId, stageDef.id, decision.verdict);
  }

  if (decision.outcome === "failed") {
    projection.stageFailed(runId, stageDef.id, decision.failureMessage ?? `${profession} failed`);
  } else {
    if (decision.verdict === "PASS") {
      projection.log(runId, stageDef.id, "pass", `${profession} reported VERDICT: PASS`);
    }
    if (!stageDef.gateAfter) {
      projection.log(runId, stageDef.id, "pass", `✓ ${profession} finished — result ready`);
      projection.stagePassed(runId, stageDef.id);
    }
  }

  return {
    outcome: decision.outcome === "asking" ? "passed" : decision.outcome,
    ...(decision.output !== undefined ? { output: decision.output } : {}),
    ...(decision.verdict !== undefined ? { verdict: decision.verdict } : {}),
    ...(outcome.sessionId !== undefined ? { sessionId: outcome.sessionId } : {}),
    startedAt,
    completedAt: nowIso(),
  };
}

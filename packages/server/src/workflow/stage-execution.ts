import { DEFAULT_PERMISSION_MODE, ENGINES, agentForStage } from "@adhd/core";
import type { RunState, StageDefinition } from "@adhd/core";
import { config } from "../config.ts";
import { getEngineAdapter } from "../engines/registry.ts";
import type { EngineRunResult } from "../engines/types.ts";
import { buildStagePrompt, parseStageVerdict } from "../domain/stage-context.ts";
import type { UpstreamOutput } from "../domain/stage-context.ts";
import { loadSkill } from "../services/skills.ts";
import { nowIso } from "../utils.ts";
import type { PipelineWorkflowInput, StageResult, WorkflowDeps } from "./types.ts";

const UNKNOWN_ENGINE_LABEL = "unknown";

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
): Promise<StageResult> {
  const { projection, registry, settings } = deps;
  const { runId } = input;
  const startedAt = nowIso();
  const run = projection.getRun(runId);
  if (!run || !run.engine) {
    return { outcome: "passed", startedAt, completedAt: nowIso() };
  }
  const profession = agentForStage(stageDef.id).profession;

  projection.stageStarted(runId, stageDef.id);
  projection.log(
    runId,
    stageDef.id,
    "info",
    `${profession} online · ${engineLabel(run)}${run.model ? ` · ${run.model}` : ""}`,
  );

  const controller = deps.beginEngineStage(runId);
  const paths = registry.resolve(run.projectId);
  const persona = stageDef.skill ? await loadSkill(paths, stageDef.skill) : undefined;
  if (stageDef.skill && !persona) {
    projection.log(
      runId,
      stageDef.id,
      "warn",
      `No skill "${stageDef.skill}" found — running without a persona`,
    );
  }
  const prompt = buildStagePrompt(input.task ?? "", upstreamFor(run, stageDef.id));

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

  if (deps.isCancelled(runId)) {
    return { outcome: "cancelled", startedAt, completedAt: nowIso() };
  }

  if (outcome.success) {
    const verdict = parseStageVerdict(outcome.result);
    if (outcome.result !== undefined && outcome.result.trim() !== "") {
      projection.captureStageOutput(runId, stageDef, outcome.result);
    }
    if (verdict !== undefined) {
      projection.setVerdict(runId, stageDef.id, verdict);
    }
    if (verdict === "FAIL") {
      projection.stageFailed(runId, stageDef.id, `${profession} reported VERDICT: FAIL`);
      return {
        outcome: "failed",
        ...(outcome.result !== undefined ? { output: outcome.result } : {}),
        verdict,
        startedAt,
        completedAt: nowIso(),
      };
    }
    if (verdict === "PASS") {
      projection.log(runId, stageDef.id, "pass", `${profession} reported VERDICT: PASS`);
    }
    if (!stageDef.gateAfter) {
      projection.log(runId, stageDef.id, "pass", `✓ ${profession} finished — result ready`);
      projection.stagePassed(runId, stageDef.id);
    }
    return {
      outcome: "passed",
      ...(outcome.result !== undefined ? { output: outcome.result } : {}),
      ...(verdict !== undefined ? { verdict } : {}),
      startedAt,
      completedAt: nowIso(),
    };
  }

  projection.stageFailed(runId, stageDef.id, outcome.errorMessage ?? `${profession} failed`);
  return { outcome: "failed", startedAt, completedAt: nowIso() };
}

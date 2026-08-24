import { STAGE_OUTCOMES, engineCapability, flattenPipelineStages } from "@isotopy/core";
import type {
  EngineId,
  PipelineDefinition,
  RunState,
  StageOutcome,
  StageState,
} from "@isotopy/core";
import type { ValidationResult } from "../validation.ts";
import { outcomeForRestart } from "./run-lifecycle.ts";

export interface SeededStart {
  startStageId: string;
  outputs: Record<string, string>;
  outcomes: Record<string, StageOutcome>;
  from?: string;
  resumeSessionId?: string;
}

export function resumableSession(
  stage: StageState | undefined,
  engineId: EngineId | undefined,
): string | undefined {
  if (stage?.sessionId === undefined || engineId === undefined) {
    return undefined;
  }
  if (stage.verdict !== undefined) {
    return undefined;
  }
  return engineCapability(engineId, "resumeSession") === "supported"
    ? stage.sessionId
    : undefined;
}

export interface SeededStage {
  output?: string;
  from?: string;
}

export function carriedOverMessage(profession: string, from: string | undefined): string {
  return `${profession} did not re-run — carried over from ${from ?? "an earlier run"}`;
}

export function resetStagesForRestart(
  stages: StageState[],
  stageOutputs: Record<string, string> | undefined,
): Record<string, string> {
  const outputs = { ...stageOutputs };
  for (const stage of stages) {
    stage.status = "pending";
    stage.logs = [];
    delete stage.startedAt;
    delete stage.completedAt;
    delete stage.verdict;
    delete outputs[stage.id];
  }
  return outputs;
}

export function seedFromRestart(run: RunState, startStageId: string): SeededStart {
  return seedStages(
    stagesBefore(run.stages, startStageId).map((stage) => ({
      id: stage.id,
      outcome: outcomeForRestart(stage),
      output: run.stageOutputs?.[stage.id],
    })),
    startStageId,
  );
}

export function seedFromSettledRun(
  pipeline: PipelineDefinition,
  settled: RunState,
  startStageId: string,
  from: string,
): ValidationResult<SeededStart> {
  const stages = flattenPipelineStages(pipeline);
  if (!stages.some((stage) => stage.id === startStageId)) {
    return issue(
      `Unknown stage id: ${startStageId} — the approved team has ${stages.map((stage) => stage.id).join(", ")}`,
    );
  }
  const preceding = stagesBefore(stages, startStageId).map((stage) => ({
    id: stage.id,
    settled: settled.stages.find((candidate) => candidate.id === stage.id),
  }));
  const missing = preceding.filter((stage) => stage.settled === undefined);
  if (missing.length > 0) {
    return issue(
      `${from} never ran ${missing.map((stage) => stage.id).join(", ")}, so a run starting at ${startStageId} would claim work nobody did`,
    );
  }
  const carried = preceding.map((stage) => ({
    id: stage.id,
    outcome: stage.settled ? outcomeForRestart(stage.settled) : STAGE_OUTCOMES.PASSED,
    output: settled.stageOutputs?.[stage.id],
  }));
  const resumeSessionId = resumableSession(
    settled.stages.find((stage) => stage.id === startStageId),
    settled.engine,
  );
  const seeded: SeededStart = { ...seedStages(carried, startStageId), from };
  return {
    ok: true,
    value: resumeSessionId === undefined ? seeded : { ...seeded, resumeSessionId },
  };
}

function issue(message: string): ValidationResult<SeededStart> {
  return { ok: false, issues: [{ path: ["fromStage"], message }] };
}

interface CarriedStage {
  id: string;
  outcome: StageOutcome;
  output?: string;
}

function stagesBefore<T extends { id: string }>(stages: T[], startStageId: string): T[] {
  const startIndex = stages.findIndex((stage) => stage.id === startStageId);
  return startIndex === -1 ? [] : stages.slice(0, startIndex);
}

function seedStages(carried: CarriedStage[], startStageId: string): SeededStart {
  const outputs: Record<string, string> = {};
  const outcomes: Record<string, StageOutcome> = {};
  for (const stage of carried) {
    outcomes[stage.id] = stage.outcome;
    if (stage.output !== undefined) {
      outputs[stage.id] = stage.output;
    }
  }
  return { startStageId, outputs, outcomes };
}

import { STAGE_OUTCOMES, flattenPipelineStages } from "@adhd/core";
import type {
  PipelineDefinition,
  RunState,
  StageOutcome,
  StageState,
} from "@adhd/core";
import type { ValidationResult } from "../validation.ts";
import { outcomeForRestart } from "./run-lifecycle.ts";

export interface SeededStart {
  startStageId: string;
  outputs: Record<string, string>;
  outcomes: Record<string, StageOutcome>;
  from?: string;
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
    return {
      ok: false,
      issues: [
        {
          path: ["fromStage"],
          message: `Unknown stage id: ${startStageId} — the approved team has ${stages.map((stage) => stage.id).join(", ")}`,
        },
      ],
    };
  }
  const carried = stagesBefore(stages, startStageId).map((stage) => {
    const settledStage = settled.stages.find((candidate) => candidate.id === stage.id);
    return {
      id: stage.id,
      outcome: settledStage ? outcomeForRestart(settledStage) : STAGE_OUTCOMES.PASSED,
      output: settled.stageOutputs?.[stage.id],
    };
  });
  return { ok: true, value: { ...seedStages(carried, startStageId), from } };
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

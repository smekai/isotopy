import {
  STAGE_OUTCOMES,
  engineCapability,
  findPipeline,
  flattenPipelineStages,
} from "@isotopy/core";
import type {
  EngineId,
  PipelineDefinition,
  ReviewContextGrant,
  RunState,
  StageDefinition,
  StageOutcome,
  StageState,
} from "@isotopy/core";
import type { ValidationResult } from "../validation.ts";
import { reviewContextChanged } from "./review-context.ts";
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
  const seeded = seedStages(
    stagesBefore(run.stages, startStageId).map((stage) => ({
      id: stage.id,
      outcome: outcomeForRestart(stage),
      output: run.stageOutputs?.[stage.id],
    })),
    startStageId,
  );
  return withResumableSession(seeded, run, startStageId);
}

function withResumableSession(
  seeded: SeededStart,
  run: RunState,
  startStageId: string,
): SeededStart {
  const stage = run.stages.find((candidate) => candidate.id === startStageId);
  const resumeSessionId = resumableSession(stage, stage?.engine);
  return resumeSessionId === undefined ? seeded : { ...seeded, resumeSessionId };
}

export function seedFromSettledRun(
  pipeline: PipelineDefinition,
  settled: RunState,
  startStageId: string,
  from: string,
  grant: ReviewContextGrant | undefined,
): ValidationResult<SeededStart> {
  const stages = flattenPipelineStages(pipeline);
  const startStage = stages.find((stage) => stage.id === startStageId);
  if (startStage === undefined) {
    return issue(
      `Unknown stage id: ${startStageId} — the flow has ${stages.map((stage) => stage.id).join(", ")}`,
    );
  }
  const ranBefore = definitionsById(settled);
  const preceding = stagesBefore(stages, startStageId).map((stage) => ({
    id: stage.id,
    settled: settled.stages.find((candidate) => candidate.id === stage.id),
    sameWork: sameWork(stage, ranBefore.get(stage.id)),
  }));
  const missing = preceding.filter((stage) => stage.settled === undefined || !stage.sameWork);
  if (missing.length > 0) {
    return issue(
      `${from} never ran ${missing.map((stage) => stage.id).join(", ")} as this flow defines it, so a run starting at ${startStageId} would claim work nobody did`,
    );
  }
  const carried = preceding.map((stage) => ({
    id: stage.id,
    outcome: stage.settled ? outcomeForRestart(stage.settled) : STAGE_OUTCOMES.PASSED,
    output: settled.stageOutputs?.[stage.id],
  }));
  const seeded: SeededStart = { ...seedStages(carried, startStageId), from };
  const resumable =
    sameWork(startStage, ranBefore.get(startStageId)) &&
    !reviewContextChanged(startStage, settled.reviewContextGrant, grant);
  return { ok: true, value: resumable ? withResumableSession(seeded, settled, startStageId) : seeded };
}

function definitionsById(run: RunState): Map<string, StageDefinition> {
  const pipeline = run.pipeline ?? findPipeline(run.pipelineId);
  const stages = pipeline === undefined ? [] : flattenPipelineStages(pipeline);
  return new Map(stages.map((stage) => [stage.id, stage]));
}

function sameWork(target: StageDefinition, ran: StageDefinition | undefined): boolean {
  return ran !== undefined && ran.skill === target.skill && ran.stepTask === target.stepTask;
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

import { ENGINES } from "@isotopy/core";
import type { EngineId, EngineSlot, StageDefinition, StageState } from "@isotopy/core";

export interface EngineAssignment {
  primary: EngineId;
  primaryModel?: string;
  secondary?: EngineId;
  secondaryModel?: string;
}

export interface StageEngine {
  engine: EngineId;
  model?: string;
}

export function stageEngineSlot(definition: StageDefinition): EngineSlot {
  return definition.engine ?? "primary";
}

function engineFor(slot: EngineSlot, assignment: EngineAssignment): StageEngine {
  if (slot === "secondary" && assignment.secondary !== undefined) {
    return { engine: assignment.secondary, model: assignment.secondaryModel };
  }
  return { engine: assignment.primary, model: assignment.primaryModel };
}

export function withStageEngines(
  stages: StageState[],
  definitions: StageDefinition[],
  assignment: EngineAssignment,
): StageState[] {
  return stages.map((stage) => {
    const definition = definitions.find((candidate) => candidate.id === stage.id);
    const slot = definition === undefined ? "primary" : stageEngineSlot(definition);
    return { ...stage, ...engineFor(slot, assignment) };
  });
}

export function pipelineEngines(
  definitions: StageDefinition[],
  assignment: EngineAssignment,
): StageEngine[] {
  const engines = definitions.map((definition) => engineFor(stageEngineSlot(definition), assignment));
  return engines.filter(
    (candidate, index) => engines.findIndex((other) => other.engine === candidate.engine) === index,
  );
}

export function secondaryFallbackNote(
  definition: StageDefinition,
  secondary: EngineId | undefined,
  primary: EngineId,
): string | undefined {
  if (stageEngineSlot(definition) !== "secondary" || secondary !== undefined) {
    return undefined;
  }
  return `No secondary engine is configured — running on ${ENGINES[primary].label}, the primary`;
}

export function stagesAfterEngineSwitch(
  stages: StageState[],
  blockedStageId: string,
  from: EngineId,
  to: StageEngine,
): StageState[] {
  return stages.map((stage) => {
    const affected =
      stage.id === blockedStageId || (stage.status === "pending" && stage.engine === from);
    return affected ? { ...stage, engine: to.engine, model: to.model } : stage;
  });
}

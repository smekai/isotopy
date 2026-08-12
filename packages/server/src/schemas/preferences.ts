import {
  ENGINE_IDS,
  LEGACY_MODEL_ALIASES,
  MODEL_TIERS,
  defaultModelTierFor,
  defaultProjectPreferences,
  tierLadderFor,
  withoutClearedOverrides,
} from "@adhd/core";
import type {
  EngineId,
  ModelTier,
  ProjectPreferences,
  ProjectPreferencesUpdate,
} from "@adhd/core";
import { z } from "zod";
import { projectPreferencesUpdateSchema } from "./request-schemas.ts";

const engineIdSchema = z.enum(ENGINE_IDS);
const storedPreferencesSchema = projectPreferencesUpdateSchema.catch({});

function currentModelId(engineId: EngineId, stored: string): string {
  return LEGACY_MODEL_ALIASES[engineId][stored] ?? stored;
}

export function normalizeProjectPreferences(raw: unknown): ProjectPreferences {
  const stored = storedPreferencesSchema.parse(raw);
  const defaults = defaultProjectPreferences();
  const engine = stored.engine ?? defaults.engine;
  const pinned = pinnedModels(stored);
  const preTierFile = stored.modelTier === undefined;
  return {
    engine,
    modelTier: stored.modelTier ?? adoptedTier(engine, pinned) ?? defaultModelTierFor(engine),
    engineModels: Object.fromEntries(preTierFile ? unladderedPins(pinned) : pinned),
    permissionMode: stored.permissionMode ?? defaults.permissionMode,
    pipelineId: stored.pipelineId ?? defaults.pipelineId,
  };
}

function pinnedModels(stored: ProjectPreferencesUpdate): [EngineId, string][] {
  return Object.entries(withoutClearedOverrides(stored.engineModels ?? {})).map(
    ([engineId, model]): [EngineId, string] => {
      const id = engineIdSchema.parse(engineId);
      return [id, currentModelId(id, model)];
    },
  );
}

function adoptedTier(engine: EngineId, pinned: [EngineId, string][]): ModelTier | undefined {
  const forEngine = pinned.find(([engineId]) => engineId === engine)?.[1];
  return forEngine === undefined ? undefined : tierOf(engine, forEngine);
}

function unladderedPins(pinned: [EngineId, string][]): [EngineId, string][] {
  return pinned.filter(([engineId, model]) => tierOf(engineId, model) === undefined);
}

function tierOf(engineId: EngineId, modelId: string): ModelTier | undefined {
  return MODEL_TIERS.find((tier) =>
    tierLadderFor(engineId, tier).some((candidate) => candidate.model === modelId),
  );
}

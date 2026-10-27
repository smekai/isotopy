import {
  ENGINE_IDS,
  LEGACY_MODEL_ALIASES,
  MODEL_TIERS,
  defaultModelTierFor,
  defaultProjectPreferences,
  tierLadderFor,
  withoutClearedGates,
  withoutClearedOverrides,
} from "@isotopy/core";
import type {
  EngineId,
  ModelTier,
  ProjectPreferences,
  ProjectPreferencesUpdate,
} from "@isotopy/core";
import { z } from "zod";
import { projectPreferencesUpdateSchema } from "./request-schemas.ts";

const engineIdSchema = z.enum(ENGINE_IDS);
export const storedPreferencesSchema = projectPreferencesUpdateSchema
  .extend({ engine: engineIdSchema.optional() })
  .strict()
  .transform(({ engine, ...stored }): ProjectPreferencesUpdate => ({
    ...stored,
    primaryEngine: stored.primaryEngine ?? engine,
  }));

const lenientStoredPreferencesSchema = storedPreferencesSchema.catch({});

function currentModelId(engineId: EngineId, stored: string): string {
  return LEGACY_MODEL_ALIASES[engineId][stored] ?? stored;
}

export function normalizeProjectPreferences(raw: unknown): ProjectPreferences {
  const stored = lenientStoredPreferencesSchema.parse(raw);
  const defaults = defaultProjectPreferences();
  const engine = stored.primaryEngine ?? defaults.primaryEngine;
  const pinned = pinnedModels(stored);
  const preTierFile = stored.modelTier === undefined;
  return {
    primaryEngine: engine,
    secondaryEngine: stored.secondaryEngine ?? undefined,
    modelTier: stored.modelTier ?? adoptedTier(engine, pinned) ?? defaultModelTierFor(engine),
    engineModels: Object.fromEntries(preTierFile ? unladderedPins(pinned) : pinned),
    permissionMode: stored.permissionMode ?? defaults.permissionMode,
    pipelineId: stored.pipelineId ?? defaults.pipelineId,
    gates: withoutClearedGates(stored.gates ?? {}),
    builtInSchedules: stored.builtInSchedules ?? defaults.builtInSchedules,
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

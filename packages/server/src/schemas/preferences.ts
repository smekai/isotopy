import {
  ENGINE_IDS,
  LEGACY_MODEL_ALIASES,
  MODEL_TIERS,
  defaultProjectPreferences,
  tierLadderFor,
  withoutClearedOverrides,
} from "@adhd/core";
import type {
  EngineId,
  ModelTier,
  ProjectPreferences,
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
  const overrides = Object.entries(withoutClearedOverrides(stored.engineModels ?? {})).map(
    ([engineId, model]): [EngineId, string] => [
      engineIdSchema.parse(engineId),
      currentModelId(engineIdSchema.parse(engineId), model),
    ],
  );
  const adopted = overrides.filter(([engineId, model]) => tierOf(engineId, model) === undefined);
  const engine = stored.engine ?? defaults.engine;
  const storedTier = overrides.find(([engineId]) => engineId === engine)?.[1];
  return {
    engine,
    modelTier:
      stored.modelTier ??
      (storedTier === undefined ? defaults.modelTier : tierOf(engine, storedTier) ?? defaults.modelTier),
    engineModels: Object.fromEntries(adopted),
    permissionMode: stored.permissionMode ?? defaults.permissionMode,
    pipelineId: stored.pipelineId ?? defaults.pipelineId,
  };
}

function tierOf(engineId: EngineId, modelId: string): ModelTier | undefined {
  return MODEL_TIERS.find((tier) =>
    tierLadderFor(engineId, tier).some((candidate) => candidate.model === modelId),
  );
}

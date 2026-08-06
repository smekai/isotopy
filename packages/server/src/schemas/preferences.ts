import {
  ENGINE_IDS,
  LEGACY_MODEL_ALIASES,
  defaultProjectPreferences,
} from "@adhd/core";
import type {
  EngineId,
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
  return {
    engine: stored.engine ?? defaults.engine,
    engineModels: Object.fromEntries(
      Object.entries(stored.engineModels ?? {}).map(([engineId, model]) => [
        engineIdSchema.parse(engineId),
        currentModelId(engineIdSchema.parse(engineId), model),
      ]),
    ),
    permissionMode: stored.permissionMode ?? defaults.permissionMode,
    pipelineId: stored.pipelineId ?? defaults.pipelineId,
  };
}

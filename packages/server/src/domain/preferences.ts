import {
  ENGINES,
  LEGACY_MODEL_ALIASES,
  PERMISSION_MODES,
  defaultProjectPreferences,
  findPipeline,
} from "@adhd/core";
import type {
  EngineId,
  EnginePermissionMode,
  ProjectPreferences,
  ProjectPreferencesUpdate,
} from "@adhd/core";

export type PreferencesUpdateParse =
  | { ok: true; update: ProjectPreferencesUpdate }
  | { ok: false; error: string };

function isEngineId(value: unknown): value is EngineId {
  return typeof value === "string" && value in ENGINES;
}

function isPermissionMode(value: unknown): value is EnginePermissionMode {
  return PERMISSION_MODES.some((mode) => mode.id === value);
}

function bagOf(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function currentModelId(engineId: EngineId, stored: string): string {
  return LEGACY_MODEL_ALIASES[engineId][stored] ?? stored;
}

function readEngineModels(value: unknown): Partial<Record<EngineId, string>> {
  const models: Partial<Record<EngineId, string>> = {};
  for (const [engineId, model] of Object.entries(bagOf(value))) {
    if (isEngineId(engineId) && typeof model === "string") {
      models[engineId] = currentModelId(engineId, model);
    }
  }
  return models;
}

function readStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function normalizeProjectPreferences(raw: unknown): ProjectPreferences {
  const stored = bagOf(raw);
  const defaults = defaultProjectPreferences();
  return {
    engine: isEngineId(stored.engine) ? stored.engine : defaults.engine,
    engineModels: readEngineModels(stored.engineModels),
    permissionMode: isPermissionMode(stored.permissionMode)
      ? stored.permissionMode
      : defaults.permissionMode,
    pipelineId:
      typeof stored.pipelineId === "string" && findPipeline(stored.pipelineId)
        ? stored.pipelineId
        : defaults.pipelineId,
    disabledStages: readStringList(stored.disabledStages),
  };
}

export function parsePreferencesUpdate(body: unknown): PreferencesUpdateParse {
  const requested = bagOf(body);
  const update: ProjectPreferencesUpdate = {};

  if (requested.engine !== undefined) {
    if (!isEngineId(requested.engine)) {
      return { ok: false, error: `Unknown engine: ${String(requested.engine)}` };
    }
    update.engine = requested.engine;
  }

  if (requested.permissionMode !== undefined) {
    if (!isPermissionMode(requested.permissionMode)) {
      return {
        ok: false,
        error: `Unknown permission mode: ${String(requested.permissionMode)}`,
      };
    }
    update.permissionMode = requested.permissionMode;
  }

  if (requested.pipelineId !== undefined) {
    if (typeof requested.pipelineId !== "string" || !findPipeline(requested.pipelineId)) {
      return { ok: false, error: `Unknown pipeline: ${String(requested.pipelineId)}` };
    }
    update.pipelineId = requested.pipelineId;
  }

  if (requested.engineModels !== undefined) {
    const models = bagOf(requested.engineModels);
    const unknown = Object.keys(models).find((engineId) => !isEngineId(engineId));
    if (unknown !== undefined) {
      return { ok: false, error: `Unknown engine: ${unknown}` };
    }
    update.engineModels = readEngineModels(models);
  }

  if (requested.disabledStages !== undefined) {
    if (!Array.isArray(requested.disabledStages)) {
      return { ok: false, error: "disabledStages must be an array of stage ids" };
    }
    update.disabledStages = readStringList(requested.disabledStages);
  }

  return { ok: true, update };
}

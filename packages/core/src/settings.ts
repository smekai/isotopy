import { DEFAULT_ENGINE_ID, DEFAULT_PERMISSION_MODE, defaultModelFor } from "./engines.ts";
import type { EngineId, EnginePermissionMode } from "./engines.ts";
import { DEFAULT_PIPELINE_ID } from "./pipelines.ts";

export interface EngineConnectionSettingsView {
  connectionMode: string;
  apiKeyConfigured: boolean;
}

export interface ProjectPreferences {
  engine: EngineId;
  engineModels: Partial<Record<EngineId, string>>;
  permissionMode: EnginePermissionMode;
  pipelineId: string;
}

export type ProjectPreferencesUpdate = Partial<ProjectPreferences>;

export interface SettingsView {
  engines: Partial<Record<EngineId, EngineConnectionSettingsView>>;
  preferences: ProjectPreferences;
}

export function defaultProjectPreferences(): ProjectPreferences {
  return {
    engine: DEFAULT_ENGINE_ID,
    engineModels: {},
    permissionMode: DEFAULT_PERMISSION_MODE,
    pipelineId: DEFAULT_PIPELINE_ID,
  };
}

export function mergeProjectPreferences(
  base: ProjectPreferences,
  update: ProjectPreferencesUpdate,
): ProjectPreferences {
  return {
    ...base,
    ...update,
    engineModels: { ...base.engineModels, ...update.engineModels },
  };
}

export function modelForEngine(
  preferences: ProjectPreferences,
  engineId: EngineId,
): string {
  return preferences.engineModels[engineId] ?? defaultModelFor(engineId);
}

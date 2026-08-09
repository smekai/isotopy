import {
  DEFAULT_ENGINE_ID,
  DEFAULT_MODEL_TIER,
  DEFAULT_PERMISSION_MODE,
  modelTierLabel,
} from "./engines.ts";
import type { EngineId, EnginePermissionMode, ModelTier } from "./engines.ts";
import { DEFAULT_PIPELINE_ID } from "./pipelines.ts";

export interface EngineConnectionSettingsView {
  connectionMode: string;
  apiKeyConfigured: boolean;
}

export interface ProjectPreferences {
  engine: EngineId;
  modelTier: ModelTier;
  /** Exact ids that override the tier, per engine — the advanced escape hatch. */
  engineModels: Partial<Record<EngineId, string>>;
  permissionMode: EnginePermissionMode;
  pipelineId: string;
}

export type ProjectPreferencesUpdate = Partial<Omit<ProjectPreferences, "engineModels">> & {
  /** `null` clears that engine's override and hands the choice back to the tier. */
  engineModels?: Partial<Record<EngineId, string | null>>;
};

export interface SettingsView {
  engines: Partial<Record<EngineId, EngineConnectionSettingsView>>;
  preferences: ProjectPreferences;
}

export function defaultProjectPreferences(): ProjectPreferences {
  return {
    engine: DEFAULT_ENGINE_ID,
    modelTier: DEFAULT_MODEL_TIER,
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
    engineModels: withoutClearedOverrides({ ...base.engineModels, ...update.engineModels }),
  };
}

export function withoutClearedOverrides(
  overrides: Partial<Record<EngineId, string | null>>,
): Partial<Record<EngineId, string>> {
  return Object.fromEntries(
    Object.entries(overrides).filter(([, model]) => typeof model === "string"),
  ) as Partial<Record<EngineId, string>>;
}

export function modelOverrideFor(
  preferences: ProjectPreferences,
  engineId: EngineId,
): string | undefined {
  return preferences.engineModels[engineId];
}

export interface PreferredRunOptions {
  engine: EngineId;
  modelTier: ModelTier;
  model?: string;
  permissionMode: EnginePermissionMode;
}

export function preferredRunOptions(preferences: ProjectPreferences): PreferredRunOptions {
  const model = modelOverrideFor(preferences, preferences.engine);
  return {
    engine: preferences.engine,
    modelTier: preferences.modelTier,
    ...(model === undefined ? {} : { model }),
    permissionMode: preferences.permissionMode,
  };
}

/** What the user chose, for display: an exact id if they pinned one, else the preset. */
export function modelChoiceLabel(preferences: ProjectPreferences, engineId: EngineId): string {
  return modelOverrideFor(preferences, engineId) ?? modelTierLabel(preferences.modelTier);
}

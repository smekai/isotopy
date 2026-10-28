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
  primaryEngine: EngineId;
  secondaryEngine?: EngineId;
  modelTier: ModelTier;
  engineModels: Partial<Record<EngineId, string>>;
  permissionMode: EnginePermissionMode;
  pipelineId: string;
  gates: Record<string, boolean>;
  builtInSchedules: boolean;
}

export type ProjectPreferencesUpdate = Partial<
  Omit<ProjectPreferences, "secondaryEngine" | "engineModels" | "gates">
> & {
  secondaryEngine?: EngineId | null;
  engineModels?: Partial<Record<EngineId, string | null>>;
  gates?: Record<string, boolean | null>;
};

export interface SettingsView {
  engines: Partial<Record<EngineId, EngineConnectionSettingsView>>;
  preferences: ProjectPreferences;
}

export function defaultProjectPreferences(): ProjectPreferences {
  return {
    primaryEngine: DEFAULT_ENGINE_ID,
    modelTier: DEFAULT_MODEL_TIER,
    engineModels: {},
    permissionMode: DEFAULT_PERMISSION_MODE,
    pipelineId: DEFAULT_PIPELINE_ID,
    gates: {},
    builtInSchedules: false,
  };
}

export function withDistinctEngines(
  current: ProjectPreferences,
  update: ProjectPreferencesUpdate,
): ProjectPreferencesUpdate {
  const primary = update.primaryEngine ?? current.primaryEngine;
  const secondary =
    update.secondaryEngine === undefined ? current.secondaryEngine : update.secondaryEngine;
  return secondary === primary ? { ...update, secondaryEngine: null } : update;
}

export function mergeProjectPreferences(
  base: ProjectPreferences,
  requested: ProjectPreferencesUpdate,
): ProjectPreferences {
  const update = withDistinctEngines(base, requested);
  return {
    ...base,
    ...update,
    secondaryEngine:
      update.secondaryEngine === null ? undefined : update.secondaryEngine ?? base.secondaryEngine,
    engineModels: withoutClearedOverrides({ ...base.engineModels, ...update.engineModels }),
    gates: withoutClearedGates({ ...base.gates, ...update.gates }),
  };
}

export function withoutClearedGates(
  overrides: Record<string, boolean | null | undefined>,
): Record<string, boolean> {
  return Object.fromEntries(
    Object.entries(overrides).filter(
      (entry): entry is [string, boolean] => typeof entry[1] === "boolean",
    ),
  );
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
  const model = modelOverrideFor(preferences, preferences.primaryEngine);
  return {
    engine: preferences.primaryEngine,
    modelTier: preferences.modelTier,
    model,
    permissionMode: preferences.permissionMode,
  };
}

export function modelChoiceLabel(preferences: ProjectPreferences, engineId: EngineId): string {
  return modelOverrideFor(preferences, engineId) ?? modelTierLabel(preferences.modelTier);
}

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ENGINES, defaultConnectionMode } from "@adhd/core";
import type {
  EngineId,
  ProjectPreferences,
  ProjectPreferencesUpdate,
  SettingsView,
} from "@adhd/core";
import { normalizeProjectPreferences } from "../domain/preferences.ts";
import type { EngineConnection } from "../engines/types.ts";
import { userSettingsPath } from "../paths.ts";

interface EngineConnectionSettings {
  connectionMode: string;
  apiKey?: string;
}

type EngineSettings = Partial<Record<EngineId, EngineConnectionSettings>>;

interface ProjectSettings {
  engines: EngineSettings;
  preferences?: ProjectPreferencesUpdate;
}

interface SettingsFile {
  version: 1;
  defaults: ProjectSettings;
  projects: Record<string, ProjectSettings>;
}

export interface EngineConnectionUpdate {
  connectionMode?: string;
  apiKey?: string | null;
}

function emptyProjectSettings(): ProjectSettings {
  return { engines: {} };
}

function emptySettings(): SettingsFile {
  return { version: 1, defaults: emptyProjectSettings(), projects: {} };
}

function readEngineBag(value: unknown): EngineSettings {
  return typeof value === "object" && value !== null ? (value as EngineSettings) : {};
}

function resolvedEntry(
  settings: SettingsFile,
  projectId: string,
  engineId: EngineId,
): EngineConnectionSettings | undefined {
  return settings.projects[projectId]?.engines[engineId] ?? settings.defaults.engines[engineId];
}

function detachedCopyOfResolvedEntry(
  settings: SettingsFile,
  projectId: string,
  engineId: EngineId,
): EngineConnectionSettings {
  return {
    ...(resolvedEntry(settings, projectId, engineId) ?? {
      connectionMode: defaultConnectionMode(engineId),
    }),
  };
}

function mergedPreferenceOverride(
  current: ProjectPreferencesUpdate | undefined,
  update: ProjectPreferencesUpdate,
): ProjectPreferencesUpdate {
  const merged: ProjectPreferencesUpdate = { ...current, ...update };
  if (update.engineModels) {
    merged.engineModels = { ...current?.engineModels, ...update.engineModels };
  }
  return merged;
}

function resolvedPreferences(settings: SettingsFile, projectId: string): ProjectPreferences {
  return normalizeProjectPreferences(
    mergedPreferenceOverride(
      settings.defaults.preferences,
      settings.projects[projectId]?.preferences ?? {},
    ),
  );
}

export class SettingsStore {
  private read(): SettingsFile {
    let raw: string;
    try {
      raw = readFileSync(userSettingsPath(), "utf8");
    } catch {
      return emptySettings();
    }
    try {
      const parsed = JSON.parse(raw) as Partial<SettingsFile>;
      return {
        version: 1,
        defaults: {
          engines: readEngineBag(parsed.defaults?.engines),
          ...(parsed.defaults?.preferences ? { preferences: parsed.defaults.preferences } : {}),
        },
        projects:
          typeof parsed.projects === "object" && parsed.projects !== null ? parsed.projects : {},
      };
    } catch {
      return emptySettings();
    }
  }

  private write(settings: SettingsFile): void {
    const target = userSettingsPath();
    mkdirSync(path.dirname(target), { recursive: true });
    const tmp = `${target}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 });
    renameSync(tmp, target);
  }

  getEngineConnection(projectId: string, engineId: EngineId): EngineConnection {
    const stored = resolvedEntry(this.read(), projectId, engineId);
    return {
      mode: stored?.connectionMode ?? defaultConnectionMode(engineId),
      ...(stored?.apiKey ? { apiKey: stored.apiKey } : {}),
    };
  }

  getPreferences(projectId: string): ProjectPreferences {
    return resolvedPreferences(this.read(), projectId);
  }

  getSettingsView(projectId: string): SettingsView {
    const settings = this.read();
    const view: SettingsView = {
      engines: {},
      preferences: resolvedPreferences(settings, projectId),
    };
    for (const engineId of Object.keys(ENGINES) as EngineId[]) {
      if (ENGINES[engineId].connections.length === 0) {
        continue;
      }
      const entry = resolvedEntry(settings, projectId, engineId);
      view.engines[engineId] = {
        connectionMode: entry?.connectionMode ?? defaultConnectionMode(engineId),
        apiKeyConfigured: Boolean(entry?.apiKey),
      };
    }
    return view;
  }

  updatePreferences(projectId: string, update: ProjectPreferencesUpdate): SettingsView {
    const settings = this.read();
    const project = settings.projects[projectId] ?? emptyProjectSettings();
    project.preferences = mergedPreferenceOverride(project.preferences, update);
    settings.projects[projectId] = project;
    this.write(settings);
    return this.getSettingsView(projectId);
  }

  updateEngineConnection(
    projectId: string,
    engineId: EngineId,
    update: EngineConnectionUpdate,
  ): SettingsView {
    const settings = this.read();
    const project = settings.projects[projectId] ?? emptyProjectSettings();
    const current = detachedCopyOfResolvedEntry(settings, projectId, engineId);
    if (update.connectionMode !== undefined) {
      current.connectionMode = update.connectionMode;
    }
    if (update.apiKey === null) {
      delete current.apiKey;
    } else if (typeof update.apiKey === "string" && update.apiKey.trim() !== "") {
      current.apiKey = update.apiKey.trim();
    }
    project.engines[engineId] = current;
    settings.projects[projectId] = project;
    this.write(settings);
    return this.getSettingsView(projectId);
  }
}

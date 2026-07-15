import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ENGINES, defaultConnectionMode } from "@adhd/core";
import type { EngineId, SettingsView } from "@adhd/core";
import type { EngineConnection } from "./engines/types.js";
import { REPO_ROOT } from "./paths.js";

// Lives under .adhd/ (gitignored) because it can hold an API key.
const SETTINGS_PATH = path.join(REPO_ROOT, ".adhd", "settings.json");

interface EngineConnectionSettings {
  connectionMode: string;
  apiKey?: string;
}

interface SettingsFile {
  version: 1;
  engines: Partial<Record<EngineId, EngineConnectionSettings>>;
}

export interface EngineConnectionUpdate {
  connectionMode?: string;
  /** A string sets the key, `null` clears it, `undefined` keeps it. */
  apiKey?: string | null;
}

function emptySettings(): SettingsFile {
  return { version: 1, engines: {} };
}

function readSettings(): SettingsFile {
  try {
    const parsed: unknown = JSON.parse(readFileSync(SETTINGS_PATH, "utf8"));
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as SettingsFile).engines === "object"
    ) {
      return { version: 1, engines: (parsed as SettingsFile).engines ?? {} };
    }
  } catch {
    // missing or corrupt file — fall through to defaults
  }
  return emptySettings();
}

function writeSettings(settings: SettingsFile): void {
  mkdirSync(path.dirname(SETTINGS_PATH), { recursive: true });
  const tmp = `${SETTINGS_PATH}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmp, SETTINGS_PATH);
}

export function getEngineConnection(engineId: EngineId): EngineConnection {
  const stored = readSettings().engines[engineId];
  return {
    mode: stored?.connectionMode ?? defaultConnectionMode(engineId),
    ...(stored?.apiKey ? { apiKey: stored.apiKey } : {}),
  };
}

/** UI-safe view: reports whether a key exists, never the key itself. */
export function getSettingsView(): SettingsView {
  const stored = readSettings().engines;
  const view: SettingsView = { engines: {} };
  for (const engineId of Object.keys(ENGINES) as EngineId[]) {
    if (ENGINES[engineId].connections.length === 0) {
      continue; // engine has no connection methods yet
    }
    const entry = stored[engineId];
    view.engines[engineId] = {
      connectionMode: entry?.connectionMode ?? defaultConnectionMode(engineId),
      apiKeyConfigured: Boolean(entry?.apiKey),
    };
  }
  return view;
}

export function updateEngineConnection(
  engineId: EngineId,
  update: EngineConnectionUpdate,
): SettingsView {
  const settings = readSettings();
  const current = settings.engines[engineId] ?? {
    connectionMode: defaultConnectionMode(engineId),
  };
  if (update.connectionMode !== undefined) {
    current.connectionMode = update.connectionMode;
  }
  if (update.apiKey === null) {
    delete current.apiKey;
  } else if (typeof update.apiKey === "string" && update.apiKey.trim() !== "") {
    current.apiKey = update.apiKey.trim();
  }
  settings.engines[engineId] = current;
  writeSettings(settings);
  return getSettingsView();
}

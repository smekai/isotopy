// Preferences used to live in localStorage under `adhd.<projectId>.<name>`
// (TASK-065 moved them to the server). This module adopts whatever a browser
// still holds, once, and is deletable once no installation predates that move.
import { ENGINES, findPipeline } from "@adhd/core";
import type { EngineId, ProjectPreferencesUpdate } from "@adhd/core";

const ENGINE_IDS = Object.keys(ENGINES) as EngineId[];

function legacyKey(projectId: string, name: string): string {
  return `adhd.${projectId}.${name}`;
}

function modelKey(projectId: string, engineId: EngineId): string {
  return legacyKey(projectId, `engineModel.${engineId}`);
}

function readKey(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function readStoredEngineModels(projectId: string): Partial<Record<EngineId, string>> {
  const models: Partial<Record<EngineId, string>> = {};
  for (const engineId of ENGINE_IDS) {
    const stored = readKey(modelKey(projectId, engineId));
    if (stored !== null) {
      models[engineId] = stored;
    }
  }
  return models;
}

/** Whatever this browser still holds for the project, or null when nothing does. */
export function readLegacyPreferences(projectId: string): ProjectPreferencesUpdate | null {
  const update: ProjectPreferencesUpdate = {};

  const engine = readKey(legacyKey(projectId, "engine"));
  if (engine !== null && engine in ENGINES) {
    update.engine = engine as EngineId;
  }

  const permissionMode = readKey(legacyKey(projectId, "permissionMode"));
  if (permissionMode === "skip" || permissionMode === "acceptEdits") {
    update.permissionMode = permissionMode;
  }

  const pipelineId = readKey(legacyKey(projectId, "pipelineId"));
  if (pipelineId !== null && findPipeline(pipelineId)) {
    update.pipelineId = pipelineId;
  }

  const engineModels = readStoredEngineModels(projectId);
  if (Object.keys(engineModels).length > 0) {
    update.engineModels = engineModels;
  }

  return Object.keys(update).length > 0 ? update : null;
}

export function clearLegacyPreferences(projectId: string): void {
  const names = [
    "engine",
    "permissionMode",
    "pipelineId",
    ...ENGINE_IDS.map((engineId) => `engineModel.${engineId}`),
  ];
  try {
    for (const name of names) {
      localStorage.removeItem(legacyKey(projectId, name));
    }
  } catch {}
}

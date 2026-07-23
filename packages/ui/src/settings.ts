import type { EngineId, EnginePermissionMode } from "@adhd/core";
import {
  DEFAULT_PERMISSION_MODE,
  defaultModelFor,
  ENGINES,
  LEGACY_MODEL_ALIASES,
} from "@adhd/core";

export function prefKey(projectId: string, name: string): string {
  return `adhd.${projectId}.${name}`;
}

function loadString(projectId: string, name: string): string | null {
  try {
    return localStorage.getItem(prefKey(projectId, name));
  } catch {
    return null;
  }
}

function saveString(projectId: string, name: string, value: string): void {
  try {
    localStorage.setItem(prefKey(projectId, name), value);
  } catch {}
}

export function loadDisabledStages(projectId: string): string[] {
  const raw = loadString(projectId, "disabledStages");
  if (!raw) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

export function saveDisabledStages(projectId: string, stageIds: string[]): void {
  saveString(projectId, "disabledStages", JSON.stringify(stageIds));
}

export function loadEngine(projectId: string): EngineId {
  const raw = loadString(projectId, "engine");
  return raw && raw in ENGINES ? (raw as EngineId) : "claude-code";
}

export function saveEngine(projectId: string, engine: EngineId): void {
  saveString(projectId, "engine", engine);
}

export function loadEngineModel(projectId: string, engineId: EngineId): string {
  const raw = loadString(projectId, `engineModel.${engineId}`);
  if (raw === null) {
    return defaultModelFor(engineId);
  }
  const migrated = LEGACY_MODEL_ALIASES[engineId][raw];
  if (migrated !== undefined) {
    saveString(projectId, `engineModel.${engineId}`, migrated);
    return migrated;
  }
  return raw;
}

export function saveEngineModel(
  projectId: string,
  engineId: EngineId,
  model: string,
): void {
  saveString(projectId, `engineModel.${engineId}`, model);
}

export function loadPermissionMode(projectId: string): EnginePermissionMode {
  return loadString(projectId, "permissionMode") === "acceptEdits"
    ? "acceptEdits"
    : DEFAULT_PERMISSION_MODE;
}

export function savePermissionMode(
  projectId: string,
  mode: EnginePermissionMode,
): void {
  saveString(projectId, "permissionMode", mode);
}

export function loadPipelineId(projectId: string): string {
  return loadString(projectId, "pipelineId") ?? "sequential";
}

export function savePipelineId(projectId: string, pipelineId: string): void {
  saveString(projectId, "pipelineId", pipelineId);
}

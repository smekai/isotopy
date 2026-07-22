import type { EngineId, EnginePermissionMode } from "@adhd/core";
import {
  DEFAULT_PERMISSION_MODE,
  defaultModelFor,
  ENGINES,
  LEGACY_MODEL_ALIASES,
} from "@adhd/core";

const STORAGE_KEY = "adhd.disabledStages";

function loadString(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function saveString(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

export function loadDisabledStages(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

export function saveDisabledStages(stageIds: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stageIds));
  } catch {}
}

export function loadEngine(): EngineId {
  const raw = loadString("adhd.engine");
  return raw && raw in ENGINES ? (raw as EngineId) : "claude-code";
}

export function saveEngine(engine: EngineId): void {
  saveString("adhd.engine", engine);
}

export function loadEngineModel(engineId: EngineId): string {
  const raw =
    loadString(`adhd.engineModel.${engineId}`) ??
    (engineId === "claude-code" ? loadString("adhd.engineModel") : null);
  if (raw === null) {
    return defaultModelFor(engineId);
  }
  const migrated = LEGACY_MODEL_ALIASES[engineId][raw];
  if (migrated !== undefined) {
    saveString(`adhd.engineModel.${engineId}`, migrated);
    return migrated;
  }
  return raw;
}

export function saveEngineModel(engineId: EngineId, model: string): void {
  saveString(`adhd.engineModel.${engineId}`, model);
}

export function loadPermissionMode(): EnginePermissionMode {
  return loadString("adhd.permissionMode") === "acceptEdits"
    ? "acceptEdits"
    : DEFAULT_PERMISSION_MODE;
}

export function savePermissionMode(mode: EnginePermissionMode): void {
  saveString("adhd.permissionMode", mode);
}

export function loadPipelineId(): string {
  return loadString("adhd.pipelineId") ?? "sequential";
}

export function savePipelineId(pipelineId: string): void {
  saveString("adhd.pipelineId", pipelineId);
}

export function loadWorkspaceDir(): string {
  return loadString("adhd.workspaceDir") ?? "";
}

export function saveWorkspaceDir(dir: string): void {
  saveString("adhd.workspaceDir", dir);
}

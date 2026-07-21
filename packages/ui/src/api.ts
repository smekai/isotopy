import type { EngineModelList, EngineStatus, RunEvent, RunState, SettingsView } from "@adhd/core";
import { RUN_EVENT_TYPES } from "@adhd/core";

const API_BASE = "";

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, init);
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed: ${path}`);
  }
  return response.json() as Promise<T>;
}

function postJson<T>(path: string, body?: unknown): Promise<T> {
  return requestJson<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export function fetchSettings(): Promise<SettingsView> {
  return requestJson<SettingsView>("/settings");
}

export interface EngineConnectionUpdate {
  connectionMode?: string;
  /** A string sets the key, `null` clears it. */
  apiKey?: string | null;
}

export function updateEngineConnection(
  engineId: string,
  update: EngineConnectionUpdate,
): Promise<SettingsView> {
  return requestJson<SettingsView>(`/settings/engines/${engineId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(update),
  });
}

export function fetchEngineStatus(engineId: string): Promise<EngineStatus> {
  return requestJson<EngineStatus>(`/engines/${engineId}/status`);
}

/** Model roster resolved server-side (from the CLI where possible, else static). */
export function fetchEngineModels(engineId: string): Promise<EngineModelList> {
  return requestJson<EngineModelList>(`/engines/${engineId}/models`);
}

export interface EngineActionResult {
  ok: boolean;
  output?: string;
  message?: string;
}

export function installEngine(engineId: string): Promise<EngineActionResult> {
  return postJson<EngineActionResult>(`/engines/${engineId}/install`);
}

export function loginEngine(engineId: string): Promise<EngineActionResult> {
  return postJson<EngineActionResult>(`/engines/${engineId}/login`);
}

export function fetchRuns(): Promise<RunState[]> {
  return requestJson<RunState[]>("/runs");
}

export function fetchRun(runId: string): Promise<RunState> {
  return requestJson<RunState>(`/runs/${runId}`);
}

export interface StartRunOptions {
  pipelineId?: string;
  task?: string;
  disabledStages?: string[];
  engine?: string;
  model?: string;
  workspaceDir?: string;
  permissionMode?: string;
  failProbability?: number;
}

export function startRun(options: StartRunOptions = {}): Promise<RunState> {
  return postJson<RunState>("/runs", { pipelineId: "sequential", ...options });
}

export interface DirectoryListing {
  /** Absolute path listed; empty when showing the roots. */
  path: string;
  parent: string | null;
  /** Subdirectory names, not full paths. */
  entries: string[];
  isRootList: boolean;
}

/**
 * Browse directories for the project-location picker. Omit `path` for the
 * roots; pass `entry` to descend into a child — the server joins it, so the
 * client never builds a platform-specific path.
 */
export function fetchDirectories(path?: string, entry?: string): Promise<DirectoryListing> {
  const params = new URLSearchParams();
  if (path) {
    params.set("path", path);
  }
  if (entry) {
    params.set("entry", entry);
  }
  const query = params.toString();
  return requestJson<DirectoryListing>(`/fs/dirs${query ? `?${query}` : ""}`);
}

export interface WorkspaceFile {
  /** POSIX-style path relative to the run's workspace. */
  path: string;
  size: number;
}

export interface WorkspaceFileContent {
  path: string;
  size: number;
  content: string;
  /** The file was too large to preview; `content` is empty. */
  truncated: boolean;
}

/** Files the run actually produced, from its shared workspace. */
export function fetchRunFiles(runId: string): Promise<{ files: WorkspaceFile[] }> {
  return requestJson<{ files: WorkspaceFile[] }>(`/runs/${runId}/files`);
}

export function fetchRunFileContent(
  runId: string,
  filePath: string,
): Promise<WorkspaceFileContent> {
  return requestJson<WorkspaceFileContent>(
    `/runs/${runId}/files/content?path=${encodeURIComponent(filePath)}`,
  );
}

export function approveGate(runId: string, stageId: string): Promise<RunState> {
  return postJson<RunState>(`/runs/${runId}/gates/${stageId}/approve`);
}

export function abortRun(runId: string): Promise<RunState> {
  return postJson<RunState>(`/runs/${runId}/abort`);
}

export function restartRun(runId: string, stageId: string): Promise<RunState> {
  return postJson<RunState>(`/runs/${runId}/restart`, { stageId });
}

export function subscribeRunEvents(
  runId: string,
  onEvent: (event: RunEvent) => void,
): () => void {
  const source = new EventSource(`${API_BASE}/runs/${runId}/events`);

  for (const type of RUN_EVENT_TYPES) {
    source.addEventListener(type, (message) => {
      if (!(message instanceof MessageEvent) || !message.data) {
        return;
      }
      try {
        onEvent(JSON.parse(message.data) as RunEvent);
      } catch {
        // ignore malformed events
      }
    });
  }

  return () => source.close();
}

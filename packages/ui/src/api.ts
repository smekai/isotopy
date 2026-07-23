import type {
  EngineModelList,
  EngineStatus,
  Project,
  ProjectPreferencesUpdate,
  ProjectsView,
  RunEvent,
  RunState,
  SettingsView,
} from "@adhd/core";
import { DEFAULT_PIPELINE_ID, HOME_PROJECT_ID, RUN_EVENT_TYPES } from "@adhd/core";

const API_BASE = "";
const PROJECT_HEADER = "X-ADHD-Project";

let activeProjectId = HOME_PROJECT_ID;

export function setActiveProjectId(projectId: string): void {
  activeProjectId = projectId;
}

function projectHeaders(extra?: HeadersInit): HeadersInit {
  return { ...(extra as Record<string, string>), [PROJECT_HEADER]: activeProjectId };
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: projectHeaders(init?.headers),
  });
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
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

export function fetchProjects(): Promise<ProjectsView> {
  return requestJson<ProjectsView>("/projects");
}

export interface AddProjectResult extends ProjectsView {
  project: Project;
}

export function addProject(root: string): Promise<AddProjectResult> {
  return postJson<AddProjectResult>("/projects", { root });
}

export function activateProject(projectId: string): Promise<ProjectsView> {
  return postJson<ProjectsView>(`/projects/${projectId}/activate`);
}

export function removeProject(projectId: string): Promise<ProjectsView> {
  return requestJson<ProjectsView>(`/projects/${projectId}`, { method: "DELETE" });
}

export function fetchSettings(): Promise<SettingsView> {
  return requestJson<SettingsView>("/settings");
}

export function updatePreferences(
  update: ProjectPreferencesUpdate,
): Promise<SettingsView> {
  return requestJson<SettingsView>("/settings/preferences", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(update),
  });
}

export interface EngineConnectionUpdate {
  connectionMode?: string;
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
  permissionMode?: string;
  failProbability?: number;
}

export function startRun(options: StartRunOptions = {}): Promise<RunState> {
  return postJson<RunState>("/runs", { pipelineId: DEFAULT_PIPELINE_ID, ...options });
}

export interface DirectoryListing {
  path: string;
  parent: string | null;
  entries: string[];
  isRootList: boolean;
}

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
  path: string;
  size: number;
}

export interface WorkspaceFileContent {
  path: string;
  size: number;
  content: string;
  truncated: boolean;
}

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
      } catch {}
    });
  }

  return () => source.close();
}

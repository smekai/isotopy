import type {
  DeploymentRecord,
  Milestone,
  MilestonePlan,
  ProjectAutomationConfig,
  EngineModelRoster,
  EngineStatus,
  LimitResolution,
  ModelTier,
  Orchestration,
  OrchestratorTeamProposal,
  ProductProcessStatus,
  Project,
  ProjectPreferencesUpdate,
  ProjectsView,
  RunEvent,
  RunMessage,
  RunState,
  RunSummary,
  ScheduleView,
  SettingsView,
  UpdateMilestoneInput,
  UpdateScheduleInput,
} from "@isotopy/core";
import {
  DEFAULT_PIPELINE_ID,
  HOME_PROJECT_ID,
  PROJECT_HEADER,
  PRODUCTION_DEPLOYMENT_CONFIRMATION,
  RUN_EVENT_TYPES,
  RUN_SUMMARY_EVENT,
} from "@isotopy/core";

const API_BASE = "";

let activeProjectId = HOME_PROJECT_ID;

export function setActiveProjectId(projectId: string): void {
  activeProjectId = projectId;
}

function projectHeaders(extra?: HeadersInit): HeadersInit {
  return { ...(extra as Record<string, string>), [PROJECT_HEADER]: activeProjectId };
}

export interface ErrorBody {
  error?: string;
  issues?: { message: string }[];
}

export function failureMessage(body: ErrorBody): string | undefined {
  const issues = body.issues?.map((issue) => issue.message).join("; ");
  return issues !== undefined && issues.length > 0 ? issues : body.error;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: projectHeaders(init?.headers),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as ErrorBody;
    throw new Error(failureMessage(body) ?? `Request failed: ${path}`);
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

function patchJson<T>(path: string, body: unknown): Promise<T> {
  return requestJson<T>(path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
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

export interface CreateScheduleBody {
  name: string;
  cron: string;
  timezone: string;
  task: string;
  team: OrchestratorTeamProposal;
  enabled?: boolean;
}

export function fetchSchedules(): Promise<ScheduleView[]> {
  return requestJson<ScheduleView[]>("/schedules");
}

export function fetchSchedule(scheduleId: string): Promise<ScheduleView> {
  return requestJson<ScheduleView>(`/schedules/${scheduleId}`);
}

export function createSchedule(body: CreateScheduleBody): Promise<ScheduleView> {
  return postJson<ScheduleView>("/schedules", body);
}

export function updateSchedule(
  scheduleId: string,
  update: UpdateScheduleInput,
): Promise<ScheduleView> {
  return patchJson<ScheduleView>(`/schedules/${scheduleId}`, update);
}

export function deleteSchedule(scheduleId: string): Promise<void> {
  return requestJson<void>(`/schedules/${scheduleId}`, { method: "DELETE" });
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

export function fetchAutomationConfig(): Promise<ProjectAutomationConfig> {
  return requestJson<ProjectAutomationConfig>("/automation");
}

export function updateAutomationConfig(
  config: ProjectAutomationConfig,
): Promise<ProjectAutomationConfig> {
  return requestJson<ProjectAutomationConfig>("/automation", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
}

export function fetchProductStatus(): Promise<ProductProcessStatus> {
  return requestJson<ProductProcessStatus>("/automation/product");
}

export function startProduct(): Promise<ProductProcessStatus> {
  return postJson<ProductProcessStatus>("/automation/product/start");
}

export function stopProduct(): Promise<ProductProcessStatus> {
  return postJson<ProductProcessStatus>("/automation/product/stop");
}

export function deployProduction(): Promise<DeploymentRecord> {
  return postJson<DeploymentRecord>("/automation/deploy/production", {
    confirmation: PRODUCTION_DEPLOYMENT_CONFIRMATION,
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

export function fetchEngineModels(engineId: string, recheck = false): Promise<EngineModelRoster> {
  return requestJson<EngineModelRoster>(`/engines/${engineId}/models${recheck ? "?refresh=1" : ""}`);
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
  engine?: string;
  model?: string;
  permissionMode?: string;
}

export function startRun(options: StartRunOptions = {}): Promise<RunState> {
  return postJson<RunState>("/runs", { pipelineId: DEFAULT_PIPELINE_ID, ...options });
}

export function startMilestonePlanning(
  options: Omit<StartRunOptions, "pipelineId" | "task"> & { goal: string },
): Promise<RunState> {
  return postJson<RunState>("/milestones/plan", options);
}

export type OrchestrationRunOptions = Omit<StartRunOptions, "pipelineId" | "task">;

export function fetchOrchestrations(): Promise<Orchestration[]> {
  return requestJson<Orchestration[]>("/orchestrations");
}

export function startOrchestration(
  options: OrchestrationRunOptions & { goal: string },
): Promise<RunState> {
  return postJson<RunState>("/orchestrations", options);
}

export interface ApproveTeamOptions extends OrchestrationRunOptions {
  roleTiers?: Record<string, ModelTier | null>;
}

export function approveOrchestratorTeam(
  orchestrationId: string,
  options: ApproveTeamOptions = {},
): Promise<RunState> {
  return postJson<RunState>(`/orchestrations/${orchestrationId}/approve`, options);
}

export function answerOrchestrator(
  orchestrationId: string,
  text: string,
): Promise<RunState> {
  return postJson<RunState>(`/orchestrations/${orchestrationId}/messages`, { text });
}

export function stopOrchestration(orchestrationId: string): Promise<Orchestration> {
  return postJson<Orchestration>(`/orchestrations/${orchestrationId}/stop`);
}

export function fetchMilestones(): Promise<Milestone[]> {
  return requestJson<Milestone[]>("/milestones");
}

export function fetchMilestone(milestoneId: string): Promise<Milestone> {
  return requestJson<Milestone>(`/milestones/${milestoneId}`);
}

export function updateMilestone(
  milestoneId: string,
  update: UpdateMilestoneInput,
): Promise<Milestone> {
  return patchJson<Milestone>(`/milestones/${milestoneId}`, update);
}

export function startNextMilestoneRun(
  milestoneId: string,
  options: Omit<StartRunOptions, "pipelineId" | "task"> = {},
): Promise<RunState> {
  return postJson<RunState>(`/milestones/${milestoneId}/start-next`, options);
}

export function acceptMilestoneFeature(
  milestoneId: string,
  featureId: string,
): Promise<Milestone> {
  return postJson<Milestone>(
    `/milestones/${milestoneId}/features/${featureId}/accept`,
  );
}

export function finalizeMilestone(milestoneId: string): Promise<Milestone> {
  return postJson<Milestone>(`/milestones/${milestoneId}/finalize`);
}

export function updateMilestoneProposal(
  milestoneId: string,
  plan: MilestonePlan,
): Promise<Milestone> {
  return patchJson<Milestone>(`/milestones/${milestoneId}/proposal`, plan);
}

export function reviseMilestonePlan(
  milestoneId: string,
  options: Omit<StartRunOptions, "pipelineId" | "task"> & { feedback: string },
): Promise<RunState> {
  return postJson<RunState>(`/milestones/${milestoneId}/revise`, options);
}

export function approveMilestonePlan(milestoneId: string): Promise<Milestone> {
  return postJson<Milestone>(`/milestones/${milestoneId}/approve`);
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

export function revealRunFolder(runId: string): Promise<{ path: string }> {
  return postJson<{ path: string }>(`/runs/${runId}/reveal`);
}

export function postRunMessage(runId: string, text: string): Promise<RunMessage> {
  return postJson<RunMessage>(`/runs/${runId}/messages`, { text });
}

export function approveGate(runId: string, stageId: string): Promise<RunState> {
  return postJson<RunState>(`/runs/${runId}/gates/${stageId}/approve`);
}

export function resolveLimit(
  runId: string,
  stageId: string,
  resolution: LimitResolution,
): Promise<RunState> {
  return postJson<RunState>(`/runs/${runId}/limit/${stageId}/resolve`, resolution);
}

export function abortRun(runId: string): Promise<RunState> {
  return postJson<RunState>(`/runs/${runId}/abort`);
}

export function restartRun(runId: string, stageId: string): Promise<RunState> {
  return postJson<RunState>(`/runs/${runId}/restart`, { stageId });
}

export function subscribeRunSummaries(
  projectId: string,
  onSummary: (summary: RunSummary) => void,
): () => void {
  const source = new EventSource(
    `${API_BASE}/runs/events?project=${encodeURIComponent(projectId)}`,
  );

  source.addEventListener(RUN_SUMMARY_EVENT, (message) => {
    if (!(message instanceof MessageEvent) || !message.data) {
      return;
    }
    try {
      onSummary(JSON.parse(message.data) as RunSummary);
    } catch {}
  });

  return () => source.close();
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

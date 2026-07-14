export type StageStatus =
  | "pending"
  | "running"
  | "passed"
  | "failed"
  | "awaiting"
  | "skipped";
export type RunStatus =
  | "pending"
  | "running"
  | "awaiting"
  | "completed"
  | "failed"
  | "cancelled";

export type LogLevel = "info" | "run" | "pass" | "fail" | "warn" | "error";

export interface StageLogEntry {
  ts: string;
  level: LogLevel;
  message: string;
}

export interface AgentDefinition {
  stageId: string;
  profession: string;
  glyph: string;
}

export const AGENTS: Record<string, AgentDefinition> = {
  intake: { stageId: "intake", profession: "Project Manager", glyph: "◈" },
  requirements: { stageId: "requirements", profession: "Business Analyst", glyph: "◉" },
  design: { stageId: "design", profession: "Software Architect", glyph: "◇" },
  implementation: { stageId: "implementation", profession: "Developer", glyph: "⬡" },
  review: { stageId: "review", profession: "Code Reviewer", glyph: "◎" },
  test: { stageId: "test", profession: "QA Engineer", glyph: "⊕" },
  release: { stageId: "release", profession: "Release Manager", glyph: "◆" },
  deploy: { stageId: "deploy", profession: "SRE", glyph: "▲" },
};

export function agentForStage(stageId: string): AgentDefinition {
  return AGENTS[stageId] ?? { stageId, profession: stageId, glyph: "◈" };
}

export type EngineId = "claude-code" | "cursor" | "codex";

/** "skip" never blocks on permission prompts (default); "acceptEdits" auto-approves edits only. */
export type EnginePermissionMode = "skip" | "acceptEdits";

export const DEFAULT_PERMISSION_MODE: EnginePermissionMode = "skip";

export interface EngineDefinition {
  id: EngineId;
  label: string;
  description: string;
  available: boolean;
}

export const ENGINES: Record<EngineId, EngineDefinition> = {
  "claude-code": {
    id: "claude-code",
    label: "Claude Code",
    description: "Anthropic's agentic coding CLI",
    available: true,
  },
  cursor: {
    id: "cursor",
    label: "Cursor",
    description: "Cursor CLI agent",
    available: false,
  },
  codex: {
    id: "codex",
    label: "Codex",
    description: "OpenAI Codex CLI",
    available: false,
  },
};

export interface StageDefinition {
  id: string;
  label: string;
  gateAfter?: boolean;
}

export interface PipelineGroup {
  mode: "sequential" | "parallel";
  stages: StageDefinition[];
}

export interface PipelineDefinition {
  id: string;
  name: string;
  description: string;
  groups: PipelineGroup[];
}

export interface StageState {
  id: string;
  label: string;
  status: StageStatus;
  logs: StageLogEntry[];
  startedAt?: string;
  completedAt?: string;
}

export interface RunState {
  id: string;
  number: number;
  pipelineId: string;
  pipelineName: string;
  status: RunStatus;
  task?: string;
  disabledStages?: string[];
  engine?: EngineId;
  model?: string;
  result?: string;
  workspacePath?: string;
  stages: StageState[];
  createdAt: string;
  completedAt?: string;
}

export type RunEventType =
  | "run.started"
  | "run.completed"
  | "stage.started"
  | "stage.log"
  | "stage.completed"
  | "stage.failed"
  | "stage.awaiting"
  | "stage.approved"
  | "stage.skipped";

export const RUN_EVENT_TYPES: RunEventType[] = [
  "run.started",
  "run.completed",
  "stage.started",
  "stage.log",
  "stage.completed",
  "stage.failed",
  "stage.awaiting",
  "stage.approved",
  "stage.skipped",
];

export interface RunEvent {
  ts: string;
  type: RunEventType;
  runId: string;
  stageId?: string;
  message?: string;
  status?: StageStatus | RunStatus;
  level?: LogLevel;
  result?: string;
}

export const LIFECYCLE_STAGES: StageDefinition[] = [
  { id: "intake", label: "Intake" },
  { id: "requirements", label: "Requirements", gateAfter: true },
  { id: "design", label: "Design", gateAfter: true },
  { id: "implementation", label: "Implementation" },
  { id: "review", label: "Review" },
  { id: "test", label: "Test" },
  { id: "release", label: "Release", gateAfter: true },
  { id: "deploy", label: "Deploy" },
];

export const SEQUENTIAL_PIPELINE: PipelineDefinition = {
  id: "sequential",
  name: "Sequential lifecycle",
  description: "Eight stages run one after another — the full ADHD pipeline.",
  groups: [
    {
      mode: "sequential",
      stages: LIFECYCLE_STAGES,
    },
  ],
};

export const ONE_BOX_PIPELINE: PipelineDefinition = {
  id: "one-box",
  name: "Single agent",
  description: "One Developer box: prompt in, result out — runs a real engine.",
  groups: [
    {
      mode: "sequential",
      stages: [{ id: "implementation", label: "Implementation" }],
    },
  ],
};

export const DEMO_PIPELINES: PipelineDefinition[] = [
  SEQUENTIAL_PIPELINE,
  ONE_BOX_PIPELINE,
];

export function flattenPipelineStages(
  pipeline: PipelineDefinition,
): StageDefinition[] {
  return pipeline.groups.flatMap((group) => group.stages);
}

export function createInitialRunState(
  runId: string,
  number: number,
  pipeline: PipelineDefinition,
  task?: string,
  disabledStages?: string[],
): RunState {
  const disabled = new Set(disabledStages ?? []);
  return {
    id: runId,
    number,
    pipelineId: pipeline.id,
    pipelineName: pipeline.name,
    status: "pending",
    task,
    disabledStages,
    createdAt: new Date().toISOString(),
    stages: flattenPipelineStages(pipeline).map((stage) => ({
      id: stage.id,
      label: stage.label,
      status: disabled.has(stage.id) ? "skipped" : "pending",
      logs: [],
    })),
  };
}

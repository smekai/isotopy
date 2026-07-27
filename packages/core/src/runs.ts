import type { EngineId } from "./engines.ts";
import type { PipelineDefinition } from "./pipelines.ts";
import { flattenPipelineStages } from "./pipelines.ts";

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

export const TERMINAL_RUN_STATUSES: RunStatus[] = [
  "completed",
  "failed",
  "cancelled",
];

export function isTerminalRunStatus(status: RunStatus): boolean {
  return TERMINAL_RUN_STATUSES.includes(status);
}

export type LogLevel = "info" | "run" | "pass" | "fail" | "warn" | "error";

export interface StageLogEntry {
  ts: string;
  level: LogLevel;
  message: string;
}

export type StageVerdict = "PASS" | "FAIL";

export type MessageRole = "user" | "agent";

export interface RunMessage {
  id: string;
  ts: string;
  role: MessageRole;
  stageId?: string;
  text: string;
}

export interface StageState {
  id: string;
  label: string;
  skill?: string;
  verdict?: StageVerdict;
  status: StageStatus;
  logs: StageLogEntry[];
  startedAt?: string;
  completedAt?: string;
}

export interface RunState {
  id: string;
  number: number;
  projectId: string;
  pipelineId: string;
  pipelineName: string;
  status: RunStatus;
  task?: string;
  engine?: EngineId;
  model?: string;
  result?: string;
  stageOutputs?: Record<string, string>;
  workspacePath?: string;
  stages: StageState[];
  messages: RunMessage[];
  createdAt: string;
  completedAt?: string;
}

export interface RunSummaryStage {
  id: string;
  label: string;
  status: StageStatus;
}

export interface RunSummary {
  id: string;
  number: number;
  projectId: string;
  pipelineId: string;
  pipelineName: string;
  status: RunStatus;
  task?: string;
  engine?: EngineId;
  model?: string;
  createdAt: string;
  completedAt?: string;
  stages: RunSummaryStage[];
}

export const RUN_SUMMARY_EVENT = "run.summary";

export function toRunSummary(run: RunState): RunSummary {
  return {
    id: run.id,
    number: run.number,
    projectId: run.projectId,
    pipelineId: run.pipelineId,
    pipelineName: run.pipelineName,
    status: run.status,
    ...(run.task !== undefined ? { task: run.task } : {}),
    ...(run.engine !== undefined ? { engine: run.engine } : {}),
    ...(run.model !== undefined ? { model: run.model } : {}),
    createdAt: run.createdAt,
    ...(run.completedAt !== undefined ? { completedAt: run.completedAt } : {}),
    stages: run.stages.map((stage) => ({
      id: stage.id,
      label: stage.label,
      status: stage.status,
    })),
  };
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
  | "stage.skipped"
  | "run.message";

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
  "run.message",
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
  chatMessage?: RunMessage;
}

export interface NewRunInput {
  runId: string;
  number: number;
  projectId: string;
  pipeline: PipelineDefinition;
  task?: string | undefined;
}

export function createInitialRunState({
  runId,
  number,
  projectId,
  pipeline,
  task,
}: NewRunInput): RunState {
  return {
    id: runId,
    number,
    projectId,
    pipelineId: pipeline.id,
    pipelineName: pipeline.name,
    status: "pending",
    ...(task !== undefined ? { task } : {}),
    stageOutputs: {},
    messages: [],
    createdAt: new Date().toISOString(),
    stages: flattenPipelineStages(pipeline).map((stage) => ({
      id: stage.id,
      label: stage.label,
      ...(stage.skill !== undefined ? { skill: stage.skill } : {}),
      status: "pending",
      logs: [],
    })),
  };
}

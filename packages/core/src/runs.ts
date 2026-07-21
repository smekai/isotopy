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

/** Run statuses that mean the run will never progress again. */
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

export interface StageState {
  id: string;
  label: string;
  /** Persona this stage ran as, copied from the stage definition. */
  skill?: string;
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
  /**
   * Final output of each engine-backed stage, keyed by stage id. `result` only
   * holds the last one; this keeps every box's output so a later box can be
   * handed what the earlier ones produced.
   */
  stageOutputs?: Record<string, string>;
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
    stageOutputs: {},
    createdAt: new Date().toISOString(),
    stages: flattenPipelineStages(pipeline).map((stage) => ({
      id: stage.id,
      label: stage.label,
      ...(stage.skill !== undefined ? { skill: stage.skill } : {}),
      status: disabled.has(stage.id) ? "skipped" : "pending",
      logs: [],
    })),
  };
}

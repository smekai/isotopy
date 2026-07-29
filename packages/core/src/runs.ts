import type { EngineId } from "./engines.ts";
import type { RunCloseoutRecord } from "./closeout.ts";
import type { PipelineDefinition } from "./pipelines.ts";
import { flattenPipelineStages } from "./pipelines.ts";

export type StageStatus =
  | "pending"
  | "running"
  | "passed"
  | "failed"
  | "awaiting"
  | "asking"
  | "skipped";
export type RunStatus =
  | "pending"
  | "running"
  | "awaiting"
  | "asking"
  | "completed"
  | "needs_attention"
  | "failed"
  | "cancelled";

export const TERMINAL_RUN_STATUSES: RunStatus[] = [
  "completed",
  "needs_attention",
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

export const STAGE_VERDICTS = {
  PASS: "PASS",
  FAIL: "FAIL",
  SKIP: "SKIP",
} as const;

export type StageVerdict = (typeof STAGE_VERDICTS)[keyof typeof STAGE_VERDICTS];

export const STAGE_OUTCOMES = {
  PASSED: "passed",
  NEEDS_ATTENTION: "needs_attention",
  FAILED: "failed",
  SKIPPED: "skipped",
  CANCELLED: "cancelled",
  ASKING: "asking",
} as const;

export type StageOutcome = (typeof STAGE_OUTCOMES)[keyof typeof STAGE_OUTCOMES];

export type MessageRole = "user" | "agent";

/** Absent means ordinary chat; a question parks the run until an answer arrives. */
export type MessageKind = "question" | "answer";

export interface RunMessage {
  id: string;
  ts: string;
  role: MessageRole;
  stageId?: string | undefined;
  kind?: MessageKind | undefined;
  text: string;
}

/** What one engine turn spent. Engines report different halves of this. */
export interface StageUsage {
  costUsd?: number | undefined;
  tokensIn?: number | undefined;
  tokensOut?: number | undefined;
  cachedTokensIn?: number | undefined;
  durationMs?: number | undefined;
  turns?: number | undefined;
}

export interface StageState {
  id: string;
  label: string;
  skill?: string | undefined;
  verdict?: StageVerdict;
  status: StageStatus;
  usage?: StageUsage;
  logs: StageLogEntry[];
  startedAt?: string;
  completedAt?: string;
}

export interface RunState {
  id: string;
  number: number;
  projectId: string;
  milestoneId?: string | undefined;
  featureId?: string | undefined;
  sourceTaskIds?: string[] | undefined;
  closeout?: RunCloseoutRecord;
  pipelineId: string;
  pipelineName: string;
  status: RunStatus;
  task?: string | undefined;
  engine?: EngineId | undefined;
  model?: string | undefined;
  result?: string;
  stageOutputs?: Record<string, string>;
  workspacePath?: string | undefined;
  stages: StageState[];
  messages: RunMessage[];
  createdAt: string;
  completedAt?: string | undefined;
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
  milestoneId?: string | undefined;
  featureId?: string | undefined;
  pipelineId: string;
  pipelineName: string;
  status: RunStatus;
  task?: string | undefined;
  engine?: EngineId | undefined;
  model?: string | undefined;
  createdAt: string;
  completedAt?: string | undefined;
  stages: RunSummaryStage[];
}

const USAGE_FIELDS = [
  "costUsd",
  "tokensIn",
  "tokensOut",
  "cachedTokensIn",
  "durationMs",
  "turns",
] as const;

export function addUsage(base: StageUsage | undefined, next: StageUsage): StageUsage {
  const total: StageUsage = { ...base };
  for (const field of USAGE_FIELDS) {
    const spent = next[field];
    if (spent !== undefined) {
      total[field] = (total[field] ?? 0) + spent;
    }
  }
  return total;
}

export function runUsage(run: RunState): StageUsage {
  return run.stages.reduce<StageUsage>(
    (total, stage) => (stage.usage ? addUsage(total, stage.usage) : total),
    {},
  );
}

const CENT = 0.01;
const THOUSAND = 1000;

function formatTokenCount(count: number): string {
  return count < THOUSAND ? `${count}` : `${(count / THOUSAND).toFixed(1)}k`;
}

/** Dollars where an engine reports them, tokens where it only counts those. */
export function formatUsage(usage: StageUsage): string | undefined {
  if (usage.costUsd !== undefined) {
    return `$${usage.costUsd.toFixed(usage.costUsd < CENT ? 4 : 2)}`;
  }
  if (usage.tokensIn !== undefined || usage.tokensOut !== undefined) {
    return `${formatTokenCount(usage.tokensIn ?? 0)} in · ${formatTokenCount(usage.tokensOut ?? 0)} out`;
  }
  return undefined;
}

export const RUN_SUMMARY_EVENT = "run.summary";

export function toRunSummary(run: RunState): RunSummary {
  return {
    id: run.id,
    number: run.number,
    projectId: run.projectId,
    milestoneId: run.milestoneId,
    featureId: run.featureId,
    pipelineId: run.pipelineId,
    pipelineName: run.pipelineName,
    status: run.status,
    task: run.task,
    engine: run.engine,
    model: run.model,
    createdAt: run.createdAt,
    completedAt: run.completedAt,
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
  | "stage.asking"
  | "stage.answered"
  | "stage.usage"
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
  "stage.asking",
  "stage.answered",
  "stage.usage",
  "run.message",
];

export interface RunEvent {
  ts: string;
  type: RunEventType;
  runId: string;
  stageId?: string | undefined;
  message?: string;
  status?: StageStatus | RunStatus;
  level?: LogLevel;
  result?: string | undefined;
  chatMessage?: RunMessage;
  usage?: StageUsage;
}

export interface NewRunInput {
  runId: string;
  number: number;
  projectId: string;
  pipeline: PipelineDefinition;
  task?: string | undefined;
  milestoneId?: string | undefined;
  featureId?: string | undefined;
  sourceTaskIds?: string[] | undefined;
}

export function createInitialRunState({
  runId,
  number,
  projectId,
  pipeline,
  task,
  milestoneId,
  featureId,
  sourceTaskIds,
}: NewRunInput): RunState {
  return {
    id: runId,
    number,
    projectId,
    milestoneId,
    featureId,
    sourceTaskIds,
    pipelineId: pipeline.id,
    pipelineName: pipeline.name,
    status: "pending",
    task,
    stageOutputs: {},
    messages: [],
    createdAt: new Date().toISOString(),
    stages: flattenPipelineStages(pipeline).map((stage) => ({
      id: stage.id,
      label: stage.label,
      skill: stage.skill,
      status: "pending",
      logs: [],
    })),
  };
}

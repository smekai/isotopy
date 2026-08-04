import { z } from "zod";
import { ENGINE_IDS } from "./engines.ts";
import type { EngineId } from "./engines.ts";
import type { RunCloseoutRecord } from "./closeout.ts";
import type { PipelineDefinition } from "./pipelines.ts";
import { flattenPipelineStages } from "./pipelines.ts";
import { requiredText, timestamp } from "./schema.ts";

export const STAGE_STATUSES = [
  "pending",
  "running",
  "passed",
  "failed",
  "awaiting",
  "asking",
  "blocked",
  "skipped",
] as const;

export type StageStatus = (typeof STAGE_STATUSES)[number];

export const RUN_STATUSES = [
  "pending",
  "running",
  "awaiting",
  "asking",
  "blocked",
  "completed",
  "needs_attention",
  "failed",
  "cancelled",
] as const;

export type RunStatus = (typeof RUN_STATUSES)[number];

export const TERMINAL_RUN_STATUSES = [
  "completed",
  "needs_attention",
  "failed",
  "cancelled",
] as const;

export function isTerminalRunStatus(status: RunStatus): boolean {
  return TERMINAL_RUN_STATUSES.some((terminal) => terminal === status);
}

export const LOG_LEVELS = [
  "info",
  "run",
  "pass",
  "fail",
  "warn",
  "error",
] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

export const STAGE_ACTIVITY_KINDS = ["tool", "tool-error", "engine"] as const;

export type StageActivityKind = (typeof STAGE_ACTIVITY_KINDS)[number];

export const stageActivitySchema = z
  .object({
    kind: z.enum(STAGE_ACTIVITY_KINDS),
    name: requiredText,
    detail: z.string().optional(),
  })
  .strict();

export type StageActivity = z.infer<typeof stageActivitySchema>;

export const stageLogEntrySchema = z
  .object({
    ts: timestamp,
    level: z.enum(LOG_LEVELS),
    message: z.string(),
    activity: stageActivitySchema.optional(),
  })
  .strict();

export type StageLogEntry = z.infer<typeof stageLogEntrySchema>;

export type StageLogDraft = Omit<StageLogEntry, "ts">;

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
  LIMITED: "limited",
} as const;

export type StageOutcome = (typeof STAGE_OUTCOMES)[keyof typeof STAGE_OUTCOMES];

export const MESSAGE_ROLES = ["user", "agent"] as const;

export type MessageRole = (typeof MESSAGE_ROLES)[number];

/** Absent means ordinary chat; a question parks the run until an answer arrives. */
export const MESSAGE_KINDS = ["question", "answer"] as const;

export type MessageKind = (typeof MESSAGE_KINDS)[number];

export const runMessageSchema = z
  .object({
    id: requiredText,
    ts: timestamp,
    role: z.enum(MESSAGE_ROLES),
    stageId: requiredText.optional(),
    kind: z.enum(MESSAGE_KINDS).optional(),
    text: z.string(),
  })
  .strict();

export type RunMessage = z.infer<typeof runMessageSchema>;

/** What one engine turn spent. Engines report different halves of this. */
export const stageUsageSchema = z
  .object({
    costUsd: z.number().nonnegative().optional(),
    tokensIn: z.number().int().nonnegative().optional(),
    tokensOut: z.number().int().nonnegative().optional(),
    cachedTokensIn: z.number().int().nonnegative().optional(),
    durationMs: z.number().nonnegative().optional(),
    turns: z.number().int().nonnegative().optional(),
  })
  .strict();

export type StageUsage = z.infer<typeof stageUsageSchema>;

export interface EngineLimit {
  raw: string;
  resetAt?: string;
}

export const runLimitSchema = z
  .object({
    raw: z.string(),
    resetAt: timestamp.optional(),
    stageId: requiredText,
    engine: z.enum(ENGINE_IDS),
    model: z.string().optional(),
    detectedAt: timestamp,
    attempt: z.number().int().positive(),
  })
  .strict();

export type RunLimit = z.infer<typeof runLimitSchema>;

export const DEFAULT_LIMIT_WAIT_MS = 30 * 60_000;

export const MAX_LIMIT_WAIT_MS = 24 * 60 * 60_000;

export const LIMIT_CHOICES = ["retry-now", "switch-model", "switch-engine"] as const;

export type LimitChoice = (typeof LIMIT_CHOICES)[number];

export type LimitResolution =
  | { choice: "retry-now" }
  | { choice: "switch-model"; model: string }
  | { choice: "switch-engine"; engine: EngineId; model?: string };

export interface StageState {
  id: string;
  label: string;
  skill?: string;
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
  milestoneId?: string;
  featureId?: string;
  sourceTaskIds?: string[];
  closeout?: RunCloseoutRecord;
  pipelineId: string;
  pipelineName: string;
  status: RunStatus;
  task?: string;
  engine?: EngineId;
  model?: string;
  limit?: RunLimit;
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
  milestoneId?: string;
  featureId?: string;
  pipelineId: string;
  pipelineName: string;
  status: RunStatus;
  task?: string;
  engine?: EngineId;
  model?: string;
  limit?: RunLimit;
  createdAt: string;
  completedAt?: string;
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
    limit: run.limit,
    createdAt: run.createdAt,
    completedAt: run.completedAt,
    stages: run.stages.map((stage) => ({
      id: stage.id,
      label: stage.label,
      status: stage.status,
    })),
  };
}

export interface NewRunInput {
  runId: string;
  number: number;
  projectId: string;
  pipeline: PipelineDefinition;
  task?: string;
  milestoneId?: string;
  featureId?: string;
  sourceTaskIds?: string[];
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

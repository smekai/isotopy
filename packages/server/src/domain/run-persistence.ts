import {
  ENGINE_IDS,
  LOG_LEVELS,
  MESSAGE_KINDS,
  MESSAGE_ROLES,
  PERMISSION_MODE_IDS,
  RUN_STATUSES,
  STAGE_STATUSES,
  STAGE_VERDICTS,
  TERMINAL_RUN_STATUSES,
} from "@adhd/core";
import type {
  EnginePermissionMode,
  RunEvent,
  RunState,
} from "@adhd/core";
import { z } from "zod";
import { productManagerCloseoutSchema } from "./closeout.ts";
import { parseJson } from "./validation.ts";
import type { ValidationResult } from "./validation.ts";

export interface PersistedRun {
  version: 1;
  run: RunState;
  permissionMode?: EnginePermissionMode;
  openWorkflowRunId?: string;
}

const text = z.string().min(1);
const strings = z.array(text);
const timestamp = text;

const usageSchema = z
  .object({
    costUsd: z.number().nonnegative().optional(),
    tokensIn: z.number().int().nonnegative().optional(),
    tokensOut: z.number().int().nonnegative().optional(),
    cachedTokensIn: z.number().int().nonnegative().optional(),
    durationMs: z.number().nonnegative().optional(),
    turns: z.number().int().nonnegative().optional(),
  })
  .strict();

const logEntrySchema = z
  .object({
    ts: timestamp,
    level: z.enum(LOG_LEVELS),
    message: z.string(),
  })
  .strict();

const runMessageSchema = z
  .object({
    id: text,
    ts: timestamp,
    role: z.enum(MESSAGE_ROLES),
    stageId: text.optional(),
    kind: z.enum(MESSAGE_KINDS).optional(),
    text: z.string(),
  })
  .strict();

const closeoutRecordSchema = z
  .object({
    report: productManagerCloseoutSchema,
    createdTasks: z.array(
      z
        .object({
          id: text,
          title: text,
          backend: z.enum(["taskplanner", "adhd"]),
        })
        .strict(),
    ),
    cleanup: z
      .object({
        removed: strings,
        rejected: strings,
      })
      .strict(),
    validationErrors: z.array(z.string()),
    completedAt: timestamp,
  })
  .strict();

const runLimitSchema = z
  .object({
    stageId: text,
    engine: z.enum(ENGINE_IDS),
    model: z.string().optional(),
    raw: z.string(),
    resetAt: timestamp.optional(),
    detectedAt: timestamp,
    attempt: z.number().int().positive(),
  })
  .strict();

const stageSchema = z
  .object({
    id: text,
    label: text,
    skill: text.optional(),
    verdict: z.enum(STAGE_VERDICTS).optional(),
    status: z.enum(STAGE_STATUSES),
    usage: usageSchema.optional(),
    logs: z.array(logEntrySchema),
    startedAt: timestamp.optional(),
    completedAt: timestamp.optional(),
  })
  .strict();

const runStateSchema = z
  .object({
    id: text,
    number: z.number().int().positive(),
    projectId: text,
    milestoneId: text.optional(),
    featureId: text.optional(),
    sourceTaskIds: strings.optional(),
    closeout: closeoutRecordSchema.optional(),
    pipelineId: text,
    pipelineName: text,
    status: z.enum(RUN_STATUSES),
    task: z.string().optional(),
    engine: z.enum(ENGINE_IDS).optional(),
    model: z.string().optional(),
    limit: runLimitSchema.optional(),
    result: z.string().optional(),
    stageOutputs: z.record(z.string(), z.string()).optional(),
    workspacePath: text.optional(),
    stages: z.array(stageSchema),
    messages: z.array(runMessageSchema),
    createdAt: timestamp,
    completedAt: timestamp.optional(),
  })
  .strict();

const persistedRunSchema: z.ZodType<PersistedRun> = z
  .object({
    version: z.literal(1),
    run: runStateSchema,
    permissionMode: z.enum(PERMISSION_MODE_IDS).optional(),
    openWorkflowRunId: text.optional(),
  })
  .strict();

const eventBase = {
  ts: timestamp,
  runId: text,
};
const stageEventBase = {
  ...eventBase,
  stageId: text,
};

const runEventSchema: z.ZodType<RunEvent> = z.discriminatedUnion("type", [
  z
    .object({
      ...eventBase,
      type: z.literal("run.started"),
      status: z.literal("running"),
      message: z.string(),
    })
    .strict(),
  z
    .object({
      ...eventBase,
      type: z.literal("run.completed"),
      status: z.enum(TERMINAL_RUN_STATUSES),
      message: z.string(),
      result: z.string().optional(),
    })
    .strict(),
  z
    .object({
      ...stageEventBase,
      type: z.literal("stage.started"),
      status: z.literal("running"),
    })
    .strict(),
  z
    .object({
      ...stageEventBase,
      type: z.literal("stage.log"),
      level: z.enum(LOG_LEVELS),
      message: z.string(),
    })
    .strict(),
  z
    .object({
      ...stageEventBase,
      type: z.literal("stage.completed"),
      status: z.literal("passed"),
      message: z.string(),
    })
    .strict(),
  z
    .object({
      ...stageEventBase,
      type: z.literal("stage.failed"),
      status: z.literal("failed"),
      message: z.string(),
    })
    .strict(),
  z
    .object({
      ...stageEventBase,
      type: z.literal("stage.awaiting"),
      status: z.literal("awaiting"),
      message: z.string(),
    })
    .strict(),
  z
    .object({
      ...stageEventBase,
      type: z.literal("stage.approved"),
      status: z.literal("passed"),
      message: z.string(),
    })
    .strict(),
  z
    .object({
      ...stageEventBase,
      type: z.literal("stage.skipped"),
      status: z.literal("skipped"),
      message: z.string().optional(),
    })
    .strict(),
  z
    .object({
      ...stageEventBase,
      type: z.literal("stage.asking"),
      status: z.literal("asking"),
      message: z.string(),
    })
    .strict(),
  z
    .object({
      ...stageEventBase,
      type: z.literal("stage.answered"),
      status: z.literal("running"),
      message: z.string(),
    })
    .strict(),
  z
    .object({
      ...stageEventBase,
      type: z.literal("stage.blocked"),
      status: z.literal("blocked"),
      message: z.string(),
      limit: runLimitSchema,
    })
    .strict(),
  z
    .object({
      ...stageEventBase,
      type: z.literal("stage.unblocked"),
      status: z.literal("running"),
      message: z.string(),
    })
    .strict(),
  z
    .object({
      ...stageEventBase,
      type: z.literal("stage.usage"),
      usage: usageSchema,
    })
    .strict(),
  z
    .object({
      ...eventBase,
      type: z.literal("run.message"),
      stageId: text.optional(),
      chatMessage: runMessageSchema,
    })
    .strict(),
]);

export function parsePersistedRun(
  textValue: string,
): ValidationResult<PersistedRun> {
  return parseJson(persistedRunSchema, textValue);
}

export function parsePersistedRunEvent(
  textValue: string,
): ValidationResult<RunEvent> {
  return parseJson(runEventSchema, textValue);
}

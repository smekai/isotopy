import { z } from "zod";
import {
  LOG_LEVELS,
  TERMINAL_RUN_STATUSES,
  runLimitSchema,
  runMessageSchema,
  stageActivitySchema,
  stageUsageSchema,
} from "./runs.ts";
import { requiredText, timestamp } from "./schema.ts";

const runEventBase = {
  ts: timestamp,
  runId: requiredText,
};

const stageEventBase = {
  ...runEventBase,
  stageId: requiredText,
};

export const runStartedEventSchema = z
  .object({
    ...runEventBase,
    type: z.literal("run.started"),
    status: z.literal("running"),
    message: z.string(),
  })
  .strict();

export const runCompletedEventSchema = z
  .object({
    ...runEventBase,
    type: z.literal("run.completed"),
    status: z.enum(TERMINAL_RUN_STATUSES),
    message: z.string(),
    result: z.string().optional(),
  })
  .strict();

export const runMessageEventSchema = z
  .object({
    ...runEventBase,
    type: z.literal("run.message"),
    stageId: requiredText.optional(),
    chatMessage: runMessageSchema,
  })
  .strict();

export const stageStartedEventSchema = z
  .object({
    ...stageEventBase,
    type: z.literal("stage.started"),
    status: z.literal("running"),
  })
  .strict();

export const stageLogEventSchema = z
  .object({
    ...stageEventBase,
    type: z.literal("stage.log"),
    level: z.enum(LOG_LEVELS),
    message: z.string(),
    activity: stageActivitySchema.optional(),
  })
  .strict();

export const stageCompletedEventSchema = z
  .object({
    ...stageEventBase,
    type: z.literal("stage.completed"),
    status: z.literal("passed"),
    message: z.string(),
  })
  .strict();

export const stageFailedEventSchema = z
  .object({
    ...stageEventBase,
    type: z.literal("stage.failed"),
    status: z.literal("failed"),
    message: z.string(),
  })
  .strict();

export const stageAwaitingEventSchema = z
  .object({
    ...stageEventBase,
    type: z.literal("stage.awaiting"),
    status: z.literal("awaiting"),
    message: z.string(),
  })
  .strict();

export const stageApprovedEventSchema = z
  .object({
    ...stageEventBase,
    type: z.literal("stage.approved"),
    status: z.literal("passed"),
    message: z.string(),
  })
  .strict();

export const stageSkippedEventSchema = z
  .object({
    ...stageEventBase,
    type: z.literal("stage.skipped"),
    status: z.literal("skipped"),
    message: z.string().optional(),
  })
  .strict();

export const stageAskingEventSchema = z
  .object({
    ...stageEventBase,
    type: z.literal("stage.asking"),
    status: z.literal("asking"),
    message: z.string(),
  })
  .strict();

export const stageAnsweredEventSchema = z
  .object({
    ...stageEventBase,
    type: z.literal("stage.answered"),
    status: z.literal("running"),
    message: z.string(),
  })
  .strict();

export const stageBlockedEventSchema = z
  .object({
    ...stageEventBase,
    type: z.literal("stage.blocked"),
    status: z.literal("blocked"),
    message: z.string(),
    limit: runLimitSchema,
  })
  .strict();

export const stageUnblockedEventSchema = z
  .object({
    ...stageEventBase,
    type: z.literal("stage.unblocked"),
    status: z.literal("running"),
    message: z.string(),
  })
  .strict();

export const stageUsageEventSchema = z
  .object({
    ...stageEventBase,
    type: z.literal("stage.usage"),
    usage: stageUsageSchema,
  })
  .strict();

export const runEventSchema = z.discriminatedUnion("type", [
  runStartedEventSchema,
  runCompletedEventSchema,
  runMessageEventSchema,
  stageStartedEventSchema,
  stageLogEventSchema,
  stageCompletedEventSchema,
  stageFailedEventSchema,
  stageAwaitingEventSchema,
  stageApprovedEventSchema,
  stageSkippedEventSchema,
  stageAskingEventSchema,
  stageAnsweredEventSchema,
  stageBlockedEventSchema,
  stageUnblockedEventSchema,
  stageUsageEventSchema,
]);

export type RunEvent = z.infer<typeof runEventSchema>;

export type RunEventType = RunEvent["type"];

export type RunStartedEvent = z.infer<typeof runStartedEventSchema>;
export type RunCompletedEvent = z.infer<typeof runCompletedEventSchema>;
export type RunMessageEvent = z.infer<typeof runMessageEventSchema>;
export type StageLogEvent = z.infer<typeof stageLogEventSchema>;
export type StageBlockedEvent = z.infer<typeof stageBlockedEventSchema>;
export type StageUsageEvent = z.infer<typeof stageUsageEventSchema>;

export type StageEvent = Extract<RunEvent, { stageId: string }>;

export const RUN_EVENT_TYPES: readonly RunEventType[] = runEventSchema.options.map(
  (arm) => arm.shape.type.value,
);

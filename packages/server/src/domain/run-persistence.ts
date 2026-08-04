import {
  ENGINE_IDS,
  PERMISSION_MODE_IDS,
  RUN_STATUSES,
  STAGE_STATUSES,
  STAGE_VERDICTS,
  requiredText,
  runCloseoutRecordSchema,
  runEventSchema,
  stageUsageSchema,
  requiredTexts,
  runLimitSchema,
  runMessageSchema,
  stageLogEntrySchema,
  timestamp,
} from "@adhd/core";
import type {
  RunEvent,
} from "@adhd/core";
import { z } from "zod";

import { parseJson } from "./validation.ts";
import type { ValidationResult } from "./validation.ts";

const text = requiredText;
const strings = requiredTexts;

const stageSchema = z
  .object({
    id: text,
    label: text,
    skill: text.optional(),
    verdict: z.enum(STAGE_VERDICTS).optional(),
    status: z.enum(STAGE_STATUSES),
    usage: stageUsageSchema.optional(),
    logs: z.array(stageLogEntrySchema),
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
    closeout: runCloseoutRecordSchema.optional(),
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

const persistedRunSchema = z
  .object({
    version: z.literal(1),
    run: runStateSchema,
    permissionMode: z.enum(PERMISSION_MODE_IDS).optional(),
    openWorkflowRunId: text.optional(),
  })
  .strict();

export type PersistedRun = z.infer<typeof persistedRunSchema>;

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

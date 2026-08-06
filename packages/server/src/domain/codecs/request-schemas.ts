import {
  ENGINE_IDS,
  LEGACY_MODEL_ALIASES,
  MILESTONE_FEATURE_STATUSES,
  MILESTONE_STATUSES,
  PERMISSION_MODE_IDS,
  findPipeline,
} from "@adhd/core";
import type {
  EngineId,
  LimitResolution,
  ProjectPreferencesUpdate,
} from "@adhd/core";
import { z } from "zod";
import type { EngineConnectionUpdate } from "../../services/settings-store.ts";

const text = z.string().trim().min(1);
const optionalText = text.optional();
const strings = z.array(text);
const engineIdSchema = z.enum(ENGINE_IDS);
const permissionModeSchema = z.enum(PERMISSION_MODE_IDS);
const pipelineIdSchema = text.refine((value) => findPipeline(value) !== undefined, {
  message: "Unknown pipeline",
});

const engineModelsSchema = z
  .partialRecord(engineIdSchema, z.string())
  .transform((models) =>
    Object.fromEntries(
      Object.entries(models).map(([engineId, model]) => [
        engineId,
        LEGACY_MODEL_ALIASES[engineId as EngineId][model] ?? model,
      ]),
    ) as Partial<Record<EngineId, string>>,
  );

export const projectPreferencesUpdateSchema: z.ZodType<ProjectPreferencesUpdate> = z
  .object({
    engine: engineIdSchema.optional(),
    engineModels: engineModelsSchema.optional(),
    permissionMode: permissionModeSchema.optional(),
    pipelineId: pipelineIdSchema.optional(),
  })
  .strict();

export const engineConnectionUpdateSchema: z.ZodType<EngineConnectionUpdate> = z
  .object({
    connectionMode: optionalText,
    apiKey: z.string().nullable().optional(),
  })
  .strict();

export const addProjectSchema = z.object({ root: text }).strict();

export const startRunSchema = z
  .object({
    pipelineId: optionalText,
    task: optionalText,
    engine: optionalText,
    model: z.string().optional(),
    permissionMode: optionalText,
    milestoneId: optionalText,
    featureId: optionalText,
    sourceTaskIds: strings.optional(),
  })
  .strict();

export const postRunMessageSchema = z.object({ text }).strict();
export const restartRunSchema = z.object({ stageId: text }).strict();

export const resolveLimitSchema: z.ZodType<LimitResolution> = z.discriminatedUnion("choice", [
  z.object({ choice: z.literal("retry-now") }).strict(),
  z.object({ choice: z.literal("switch-model"), model: text }).strict(),
  z
    .object({
      choice: z.literal("switch-engine"),
      engine: engineIdSchema,
      model: z.string().optional(),
    })
    .strict(),
]);

export const createMilestoneFeatureSchema = z
  .object({
    title: text,
    description: optionalText,
    acceptanceCriteria: strings.optional(),
    taskIds: strings.optional(),
  })
  .strict();

export const createMilestoneSchema = z
  .object({
    name: text,
    goal: optionalText,
    status: z.enum(["draft", "active"]).optional(),
    autoRunNext: z.boolean().optional(),
    features: z.array(createMilestoneFeatureSchema).optional(),
  })
  .strict();

export const updateMilestoneSchema = z
  .object({
    name: optionalText,
    goal: text.nullable().optional(),
    status: z.enum(MILESTONE_STATUSES).optional(),
    autoRunNext: z.boolean().optional(),
  })
  .strict();

export const updateMilestoneFeatureSchema = z
  .object({
    title: optionalText,
    description: text.nullable().optional(),
    acceptanceCriteria: strings.optional(),
    status: z.enum(MILESTONE_FEATURE_STATUSES).optional(),
    taskIds: strings.optional(),
  })
  .strict();

export const startMilestonePlanningSchema = z
  .object({
    goal: text,
    engine: optionalText,
    model: z.string().optional(),
    permissionMode: optionalText,
  })
  .strict();

export const reviseMilestonePlanSchema = z
  .object({
    feedback: text,
    engine: optionalText,
    model: z.string().optional(),
    permissionMode: optionalText,
  })
  .strict();

export const startOrchestrationSchema = z
  .object({
    goal: text,
    engine: optionalText,
    model: z.string().optional(),
    permissionMode: optionalText,
  })
  .strict();

export const approveTeamSchema = z
  .object({
    engine: optionalText,
    model: z.string().optional(),
    permissionMode: optionalText,
  })
  .strict();

export const startNextMilestoneRunSchema = z
  .object({
    engine: optionalText,
    model: z.string().optional(),
    permissionMode: optionalText,
  })
  .strict();

export type CreateMilestoneFeatureInput = z.infer<typeof createMilestoneFeatureSchema>;
export type CreateMilestoneInput = z.infer<typeof createMilestoneSchema>;
export type UpdateMilestoneFeatureInput = z.infer<typeof updateMilestoneFeatureSchema>;
export type StartMilestonePlanningInput = z.infer<typeof startMilestonePlanningSchema>;
export type ReviseMilestonePlanInput = z.infer<typeof reviseMilestonePlanSchema>;

import {
  ENGINE_IDS,
  LEGACY_MODEL_ALIASES,
  MILESTONE_FEATURE_STATUSES,
  MILESTONE_STATUSES,
  MODEL_TIERS,
  PERMISSION_MODE_IDS,
  findPipeline,
} from "@isotopy/core";
import type {
  EngineId,
  LimitResolution,
  ProjectPreferencesUpdate,
} from "@isotopy/core";
import { z } from "zod";

const text = z.string().trim().min(1);
const optionalText = text.optional();
const strings = z.array(text);
const engineIdSchema = z.enum(ENGINE_IDS);
const permissionModeSchema = z.enum(PERMISSION_MODE_IDS);
const pipelineIdSchema = text.refine((value) => findPipeline(value) !== undefined, {
  message: "Unknown pipeline",
});

const engineModelsSchema = z
  .partialRecord(engineIdSchema, z.string().nullable())
  .transform((models) =>
    Object.fromEntries(
      Object.entries(models).map(([engineId, model]) => [
        engineId,
        model === null ? null : LEGACY_MODEL_ALIASES[engineId as EngineId][model] ?? model,
      ]),
    ) as Partial<Record<EngineId, string | null>>,
  );

export const projectPreferencesUpdateSchema: z.ZodType<ProjectPreferencesUpdate> = z
  .object({
    engine: engineIdSchema.optional(),
    modelTier: z.enum(MODEL_TIERS).optional(),
    engineModels: engineModelsSchema.optional(),
    permissionMode: permissionModeSchema.optional(),
    pipelineId: pipelineIdSchema.optional(),
    gates: z.record(z.string(), z.boolean().nullable()).optional(),
    builtInSchedules: z.boolean().optional(),
  })
  .strict();

export const engineConnectionUpdateSchema = z
  .object({
    connectionMode: optionalText,
    apiKey: z.string().nullable().optional(),
  })
  .strict();

export type EngineConnectionUpdate = z.infer<typeof engineConnectionUpdateSchema>;

export const addProjectSchema = z.object({ root: text }).strict();

export const startRunSchema = z
  .object({
    pipelineId: optionalText,
    task: optionalText,
    engine: optionalText,
    model: z.string().optional(),
    modelTier: z.enum(MODEL_TIERS).optional(),
    permissionMode: permissionModeSchema.optional(),
    milestoneId: optionalText,
    featureId: optionalText,
    sourceTaskIds: strings.optional(),
  })
  .strict();

export const postRunMessageSchema = z.object({ text }).strict();
export const restartRunSchema = z.object({ stageId: text }).strict();

export const resolveLimitSchema: z.ZodType<LimitResolution> = z.discriminatedUnion("choice", [
  z.object({ choice: z.literal("retry-now") }).strict(),
  z.object({ choice: z.literal("switch-tier"), tier: z.enum(MODEL_TIERS) }).strict(),
  z.object({ choice: z.literal("switch-engine"), engine: engineIdSchema }).strict(),
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
    modelTier: z.enum(MODEL_TIERS).optional(),
    permissionMode: permissionModeSchema.optional(),
  })
  .strict();

export const reviseMilestonePlanSchema = z
  .object({
    feedback: text,
    engine: optionalText,
    model: z.string().optional(),
    modelTier: z.enum(MODEL_TIERS).optional(),
    permissionMode: permissionModeSchema.optional(),
  })
  .strict();

export const startOrchestrationSchema = z
  .object({
    goal: text,
    engine: optionalText,
    model: z.string().optional(),
    modelTier: z.enum(MODEL_TIERS).optional(),
    permissionMode: permissionModeSchema.optional(),
  })
  .strict();

export const approveTeamSchema = z
  .object({
    engine: optionalText,
    model: z.string().optional(),
    modelTier: z.enum(MODEL_TIERS).optional(),
    roleTiers: z.record(z.string(), z.enum(MODEL_TIERS).nullable()).optional(),
    permissionMode: permissionModeSchema.optional(),
  })
  .strict();

export const startNextMilestoneRunSchema = z
  .object({
    engine: optionalText,
    model: z.string().optional(),
    modelTier: z.enum(MODEL_TIERS).optional(),
    permissionMode: permissionModeSchema.optional(),
  })
  .strict();

export type CreateMilestoneFeatureInput = z.infer<typeof createMilestoneFeatureSchema>;
export type CreateMilestoneInput = z.infer<typeof createMilestoneSchema>;
export type UpdateMilestoneFeatureInput = z.infer<typeof updateMilestoneFeatureSchema>;
export type StartMilestonePlanningInput = z.infer<typeof startMilestonePlanningSchema>;
export type ReviseMilestonePlanInput = z.infer<typeof reviseMilestonePlanSchema>;

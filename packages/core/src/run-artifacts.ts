import { z } from "zod";
import { FINDING_SEVERITIES } from "./milestones.ts";
import { requiredText, requiredTexts, timestamp } from "./schema.ts";

export const closeoutFindingSchema = z
  .object({
    id: requiredText,
    title: requiredText,
    severity: z.enum(FINDING_SEVERITIES),
    evidence: requiredText.optional(),
  })
  .strict();

export type CloseoutFinding = z.infer<typeof closeoutFindingSchema>;

export const RUN_ARTIFACTS_SHAPE = {
  summary: requiredText,
  deliveredScope: requiredTexts,
  decisions: requiredTexts,
  knowledge: requiredTexts,
  findings: z.array(closeoutFindingSchema),
  nextRecommendation: requiredText.optional(),
};

export const runArtifactsSchema = z.object(RUN_ARTIFACTS_SHAPE).strict();

export type RunArtifacts = z.infer<typeof runArtifactsSchema>;

export const runArtifactRecordSchema = z
  .object({
    report: runArtifactsSchema,
    validationErrors: z.array(z.string()),
    collectedAt: timestamp,
  })
  .strict();

export type RunArtifactRecord = z.infer<typeof runArtifactRecordSchema>;

/** Durable facts a persona learned about this project, carried into its next run. */
export const personaNotesSchema = z
  .object({
    notes: z.array(requiredText).min(1),
  })
  .strict();

export type PersonaNotes = z.infer<typeof personaNotesSchema>;

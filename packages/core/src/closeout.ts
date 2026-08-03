import { z } from "zod";
import { FINDING_SEVERITIES, TASK_PRIORITIES } from "./milestones.ts";
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

export const followUpTaskDraftSchema = z
  .object({
    findingId: requiredText,
    title: requiredText,
    description: requiredText,
    priority: z.enum(TASK_PRIORITIES),
    tags: requiredTexts,
  })
  .strict();

export type FollowUpTaskDraft = z.infer<typeof followUpTaskDraftSchema>;

export const cleanupCandidateSchema = z
  .object({
    relativePath: requiredText,
    reason: requiredText,
  })
  .strict();

export type CleanupCandidate = z.infer<typeof cleanupCandidateSchema>;

/**
 * The field-by-field shape, exported so the agent boundary can override
 * individual fields with its salvaging variants rather than restating all ten.
 */
export const CLOSEOUT_SHAPE = {
  summary: requiredText,
  deliveredScope: requiredTexts,
  decisions: requiredTexts,
  knowledge: requiredTexts,
  findings: z.array(closeoutFindingSchema),
  tasks: z.array(followUpTaskDraftSchema),
  completedTaskIds: requiredTexts,
  unresolvedTaskIds: requiredTexts,
  cleanup: z.array(cleanupCandidateSchema),
  nextRecommendation: requiredText.optional(),
};

export function refineDeclaredFindings(
  closeout: { findings: CloseoutFinding[]; tasks: FollowUpTaskDraft[] },
  context: z.core.$RefinementCtx,
): void {
  const declared = new Set(closeout.findings.map((finding) => finding.id));
  closeout.tasks.forEach((task, index) => {
    if (!declared.has(task.findingId)) {
      context.addIssue({
        code: "custom",
        path: ["tasks", index, "findingId"],
        message: "Follow-up task must reference a declared finding",
      });
    }
  });
}

export const productManagerCloseoutSchema = z
  .object(CLOSEOUT_SHAPE)
  .strict()
  .superRefine(refineDeclaredFindings);

export type ProductManagerCloseout = z.infer<typeof productManagerCloseoutSchema>;

export const createdTaskReferenceSchema = z
  .object({
    id: requiredText,
    title: requiredText,
    backend: z.enum(["taskplanner", "adhd"]),
  })
  .strict();

export type CreatedTaskReference = z.infer<typeof createdTaskReferenceSchema>;

export const cleanupResultSchema = z
  .object({
    removed: requiredTexts,
    rejected: requiredTexts,
  })
  .strict();

export type CleanupResult = z.infer<typeof cleanupResultSchema>;

export const runCloseoutRecordSchema = z
  .object({
    report: productManagerCloseoutSchema,
    createdTasks: z.array(createdTaskReferenceSchema),
    cleanup: cleanupResultSchema,
    validationErrors: z.array(z.string()),
    completedAt: timestamp,
  })
  .strict();

export type RunCloseoutRecord = z.infer<typeof runCloseoutRecordSchema>;

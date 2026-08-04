import { z } from "zod";
import { requiredText, requiredTexts, timestamp } from "./schema.ts";

export const MILESTONE_STATUSES = [
  "draft",
  "active",
  "paused",
  "completed",
] as const;

export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number];

export const MILESTONE_FEATURE_STATUSES = [
  "ready",
  "in_progress",
  "needs_attention",
  "completed",
] as const;

export type MilestoneFeatureStatus =
  (typeof MILESTONE_FEATURE_STATUSES)[number];

export const TASK_PRIORITIES = ["P0", "P1", "P2", "P3", "P4"] as const;

export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const FINDING_SEVERITIES = ["blocking", "non_blocking"] as const;

export type FindingSeverity = (typeof FINDING_SEVERITIES)[number];

export const milestoneFindingSchema = z
  .object({
    id: requiredText,
    title: requiredText,
    severity: z.enum(FINDING_SEVERITIES),
    sourceRunId: requiredText,
    evidence: requiredText.optional(),
  })
  .strict();

export type MilestoneFinding = z.infer<typeof milestoneFindingSchema>;

export const milestoneTaskDraftSchema = z
  .object({
    id: requiredText,
    title: requiredText,
    description: requiredText,
    priority: z.enum(TASK_PRIORITIES),
    tags: requiredTexts,
    createdTaskId: requiredText.optional(),
  })
  .strict();

export type MilestoneTaskDraft = z.infer<typeof milestoneTaskDraftSchema>;

export const milestoneFeatureProposalSchema = z
  .object({
    id: requiredText,
    title: requiredText,
    description: requiredText,
    acceptanceCriteria: requiredTexts,
    existingTaskIds: requiredTexts,
    taskDrafts: z.array(milestoneTaskDraftSchema),
  })
  .strict();

export type MilestoneFeatureProposal = z.infer<
  typeof milestoneFeatureProposalSchema
>;

export const MILESTONE_PLAN_SHAPE = {
  name: requiredText,
  goal: requiredText,
  features: z.array(milestoneFeatureProposalSchema).min(1),
};

export function refineMilestonePlan(
  plan: { features: MilestoneFeatureProposal[] },
  context: z.core.$RefinementCtx,
): void {
  const featureIds = plan.features.map((feature) => feature.id);
  if (new Set(featureIds).size !== featureIds.length) {
    context.addIssue({
      code: "custom",
      path: ["features"],
      message: "Feature IDs must be unique",
    });
  }

  const draftIds = plan.features.flatMap((feature) =>
    feature.taskDrafts.map((task) => task.id),
  );
  if (new Set(draftIds).size !== draftIds.length) {
    context.addIssue({
      code: "custom",
      path: ["features"],
      message: "Draft task IDs must be unique",
    });
  }

  plan.features.forEach((feature, index) => {
    if (feature.acceptanceCriteria.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["features", index, "acceptanceCriteria"],
        message: "At least one acceptance criterion is required",
      });
    }
    if (feature.existingTaskIds.length + feature.taskDrafts.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["features", index],
        message: "A feature must link or draft at least one task",
      });
    }
  });
}

export const milestonePlanSchema = z
  .object(MILESTONE_PLAN_SHAPE)
  .strict()
  .superRefine(refineMilestonePlan);

export type MilestonePlan = z.infer<typeof milestonePlanSchema>;

export const milestoneProposalSchema = z
  .object({
    revision: z.number().int().positive(),
    ...MILESTONE_PLAN_SHAPE,
    createdAt: timestamp,
  })
  .strict();

export type MilestoneProposal = z.infer<typeof milestoneProposalSchema>;

export function toMilestoneProposal(
  plan: MilestonePlan,
  revision: number,
  createdAt: string,
): MilestoneProposal {
  return { revision, ...plan, createdAt };
}

export const milestoneFeatureSchema = z
  .object({
    id: requiredText,
    title: requiredText,
    description: requiredText.optional(),
    acceptanceCriteria: requiredTexts,
    status: z.enum(MILESTONE_FEATURE_STATUSES),
    taskIds: requiredTexts,
    runIds: requiredTexts,
    findings: z.array(milestoneFindingSchema),
    createdAt: timestamp,
    updatedAt: timestamp,
    completedAt: timestamp.optional(),
    acceptedAt: timestamp.optional(),
  })
  .strict();

export type MilestoneFeature = z.infer<typeof milestoneFeatureSchema>;

export const milestoneSchema = z
  .object({
    id: requiredText,
    projectId: requiredText,
    name: requiredText,
    goal: requiredText.optional(),
    status: z.enum(MILESTONE_STATUSES),
    autoRunNext: z.boolean(),
    features: z.array(milestoneFeatureSchema),
    planningRunIds: requiredTexts,
    proposal: milestoneProposalSchema.optional(),
    approvalError: requiredText.optional(),
    createdAt: timestamp,
    updatedAt: timestamp,
    completedAt: timestamp.optional(),
  })
  .strict();

export type Milestone = z.infer<typeof milestoneSchema>;

export interface UpdateMilestoneInput {
  name?: string;
  goal?: string | null;
  status?: MilestoneStatus;
  autoRunNext?: boolean;
}

export function nextMilestoneFeature(
  milestone: Milestone,
): MilestoneFeature | undefined {
  return milestone.features.find((feature) => feature.status === "ready");
}

export interface MilestoneProgress {
  completed: number;
  total: number;
}

export function milestoneProgress(milestone: Milestone): MilestoneProgress {
  return {
    completed: milestone.features.filter(
      (feature) => feature.status === "completed",
    ).length,
    total: milestone.features.length,
  };
}

export function canStartNextFeature(milestone: Milestone): boolean {
  return (
    milestone.status === "active" &&
    !milestone.features.some((feature) => feature.status === "in_progress") &&
    nextMilestoneFeature(milestone) !== undefined
  );
}

export function canAcceptMilestoneFeature(feature: MilestoneFeature): boolean {
  return feature.status === "needs_attention";
}

export function canFinalizeMilestone(milestone: Milestone): boolean {
  return (
    milestone.status === "active" &&
    milestone.features.every((feature) => feature.status === "completed")
  );
}

export function milestoneFindings(milestone: Milestone): MilestoneFinding[] {
  const findings = milestone.features.flatMap((feature) => feature.findings);
  return [
    ...findings.filter((finding) => finding.severity === "blocking"),
    ...findings.filter((finding) => finding.severity !== "blocking"),
  ];
}

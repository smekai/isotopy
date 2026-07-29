import {
  MILESTONE_FEATURE_STATUSES,
  MILESTONE_STATUSES,
  TASK_PRIORITIES,
  type Milestone,
} from "@adhd/core";
import { z } from "zod";

const requiredText = z.string().trim().min(1);
const strings = z.array(requiredText);

const findingSchema = z
  .object({
    id: requiredText,
    title: requiredText,
    severity: z.enum(["blocking", "non_blocking"]),
    sourceRunId: requiredText,
    evidence: requiredText.optional(),
  })
  .strict();

const taskDraftSchema = z
  .object({
    id: requiredText,
    title: requiredText,
    description: requiredText,
    priority: z.enum(TASK_PRIORITIES),
    tags: strings,
    createdTaskId: requiredText.optional(),
  })
  .strict();

const featureProposalSchema = z
  .object({
    id: requiredText,
    title: requiredText,
    description: requiredText,
    acceptanceCriteria: strings,
    existingTaskIds: strings,
    taskDrafts: z.array(taskDraftSchema),
  })
  .strict();

const proposalSchema = z
  .object({
    revision: z.number().int().positive(),
    name: requiredText,
    goal: requiredText,
    features: z.array(featureProposalSchema),
    createdAt: requiredText,
  })
  .strict();

const featureSchema = z
  .object({
    id: requiredText,
    title: requiredText,
    description: requiredText.optional(),
    acceptanceCriteria: strings,
    status: z.enum(MILESTONE_FEATURE_STATUSES),
    taskIds: strings,
    runIds: strings,
    findings: z.array(findingSchema),
    createdAt: requiredText,
    updatedAt: requiredText,
    completedAt: requiredText.optional(),
  })
  .strict();

const milestoneSchema = z
  .object({
    id: requiredText,
    projectId: requiredText,
    name: requiredText,
    goal: requiredText.optional(),
    status: z.enum(MILESTONE_STATUSES),
    autoRunNext: z.boolean(),
    features: z.array(featureSchema),
    planningRunIds: strings,
    proposal: proposalSchema.optional(),
    approvalError: requiredText.optional(),
    createdAt: requiredText,
    updatedAt: requiredText,
    completedAt: requiredText.optional(),
  })
  .strict();

export function parsePersistedMilestone(data: string): Milestone | undefined {
  try {
    const parsed = milestoneSchema.safeParse(JSON.parse(data));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

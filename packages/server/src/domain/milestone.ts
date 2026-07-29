import {
  MILESTONE_FEATURE_STATUSES,
  MILESTONE_STATUSES,
  TASK_PRIORITIES,
  type Milestone,
  type MilestoneFeature,
  type MilestoneFinding,
  type MilestoneProposal,
  type MilestoneTaskDraft,
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

function toMilestoneTaskDraft(
  input: z.infer<typeof taskDraftSchema>,
): MilestoneTaskDraft {
  const task: MilestoneTaskDraft = {
    id: input.id,
    title: input.title,
    description: input.description,
    priority: input.priority,
    tags: input.tags,
  };
  if (input.createdTaskId !== undefined) {
    task.createdTaskId = input.createdTaskId;
  }
  return task;
}

function toMilestoneProposal(
  input: z.infer<typeof proposalSchema>,
): MilestoneProposal {
  return {
    revision: input.revision,
    name: input.name,
    goal: input.goal,
    features: input.features.map((feature) => ({
      id: feature.id,
      title: feature.title,
      description: feature.description,
      acceptanceCriteria: feature.acceptanceCriteria,
      existingTaskIds: feature.existingTaskIds,
      taskDrafts: feature.taskDrafts.map(toMilestoneTaskDraft),
    })),
    createdAt: input.createdAt,
  };
}

function toMilestoneFinding(
  input: z.infer<typeof findingSchema>,
): MilestoneFinding {
  const finding: MilestoneFinding = {
    id: input.id,
    title: input.title,
    severity: input.severity,
    sourceRunId: input.sourceRunId,
  };
  if (input.evidence !== undefined) finding.evidence = input.evidence;
  return finding;
}

function toMilestoneFeature(
  input: z.infer<typeof featureSchema>,
): MilestoneFeature {
  const feature: MilestoneFeature = {
    id: input.id,
    title: input.title,
    acceptanceCriteria: input.acceptanceCriteria,
    status: input.status,
    taskIds: input.taskIds,
    runIds: input.runIds,
    findings: input.findings.map(toMilestoneFinding),
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  };
  if (input.description !== undefined) feature.description = input.description;
  if (input.completedAt !== undefined) feature.completedAt = input.completedAt;
  return feature;
}

export function parsePersistedMilestone(data: string): Milestone | undefined {
  try {
    const parsed = milestoneSchema.safeParse(JSON.parse(data));
    if (!parsed.success) return undefined;
    const milestone: Milestone = {
      id: parsed.data.id,
      projectId: parsed.data.projectId,
      name: parsed.data.name,
      status: parsed.data.status,
      autoRunNext: parsed.data.autoRunNext,
      features: parsed.data.features.map(toMilestoneFeature),
      planningRunIds: parsed.data.planningRunIds,
      createdAt: parsed.data.createdAt,
      updatedAt: parsed.data.updatedAt,
    };
    if (parsed.data.goal !== undefined) milestone.goal = parsed.data.goal;
    if (parsed.data.proposal !== undefined) {
      milestone.proposal = toMilestoneProposal(parsed.data.proposal);
    }
    if (parsed.data.approvalError !== undefined) {
      milestone.approvalError = parsed.data.approvalError;
    }
    if (parsed.data.completedAt !== undefined) {
      milestone.completedAt = parsed.data.completedAt;
    }
    return milestone;
  } catch {
    return undefined;
  }
}

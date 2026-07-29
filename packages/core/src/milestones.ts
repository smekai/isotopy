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

export interface MilestoneFinding {
  id: string;
  title: string;
  severity: "blocking" | "non_blocking";
  sourceRunId: string;
  evidence?: string | undefined;
}

export interface MilestoneTaskDraft {
  id: string;
  title: string;
  description: string;
  priority: TaskPriority;
  tags: string[];
  createdTaskId?: string | undefined;
}

export interface MilestoneFeatureProposal {
  id: string;
  title: string;
  description: string;
  acceptanceCriteria: string[];
  existingTaskIds: string[];
  taskDrafts: MilestoneTaskDraft[];
}

export interface MilestoneProposal {
  revision: number;
  name: string;
  goal: string;
  features: MilestoneFeatureProposal[];
  createdAt: string;
}

export interface MilestoneFeature {
  id: string;
  title: string;
  description?: string | undefined;
  acceptanceCriteria: string[];
  status: MilestoneFeatureStatus;
  taskIds: string[];
  runIds: string[];
  findings: MilestoneFinding[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string | undefined;
}

export interface Milestone {
  id: string;
  projectId: string;
  name: string;
  goal?: string | undefined;
  status: MilestoneStatus;
  autoRunNext: boolean;
  features: MilestoneFeature[];
  planningRunIds: string[];
  proposal?: MilestoneProposal | undefined;
  approvalError?: string | undefined;
  createdAt: string;
  updatedAt: string;
  completedAt?: string | undefined;
}

export interface CreateMilestoneFeatureInput {
  title: string;
  description?: string;
  acceptanceCriteria?: string[];
  taskIds?: string[];
}

export interface CreateMilestoneInput {
  name: string;
  goal?: string;
  status?: "draft" | "active";
  autoRunNext?: boolean;
  features?: CreateMilestoneFeatureInput[];
}

export interface StartMilestonePlanningInput {
  goal: string;
  engine?: string;
  model?: string;
  permissionMode?: string;
}

export interface ReviseMilestonePlanInput {
  feedback: string;
  engine?: string;
  model?: string;
  permissionMode?: string;
}

export interface UpdateMilestoneInput {
  name?: string;
  goal?: string | null;
  status?: MilestoneStatus;
  autoRunNext?: boolean;
}

export interface UpdateMilestoneFeatureInput {
  title?: string;
  description?: string | null;
  acceptanceCriteria?: string[];
  status?: MilestoneFeatureStatus;
  taskIds?: string[];
}

export function nextMilestoneFeature(
  milestone: Milestone,
): MilestoneFeature | undefined {
  return milestone.features.find((feature) => feature.status === "ready");
}

export function milestoneProgress(milestone: Milestone): {
  completed: number;
  total: number;
} {
  return {
    completed: milestone.features.filter(
      (feature) => feature.status === "completed",
    ).length,
    total: milestone.features.length,
  };
}

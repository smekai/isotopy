export type MilestoneStatus = "draft" | "active" | "paused" | "completed";

export type MilestoneFeatureStatus =
  | "ready"
  | "in_progress"
  | "needs_attention"
  | "completed";

export type TaskPriority = "P0" | "P1" | "P2" | "P3" | "P4";

export interface MilestoneFinding {
  id: string;
  title: string;
  severity: "blocking" | "non_blocking";
  sourceRunId: string;
  evidence?: string;
}

export interface MilestoneTaskDraft {
  id: string;
  title: string;
  description: string;
  priority: TaskPriority;
  tags: string[];
  createdTaskId?: string;
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
  description?: string;
  acceptanceCriteria: string[];
  status: MilestoneFeatureStatus;
  taskIds: string[];
  runIds: string[];
  findings: MilestoneFinding[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface Milestone {
  id: string;
  projectId: string;
  name: string;
  goal?: string;
  status: MilestoneStatus;
  autoRunNext: boolean;
  features: MilestoneFeature[];
  planningRunIds: string[];
  proposal?: MilestoneProposal;
  approvalError?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
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

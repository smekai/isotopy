import type { TaskPriority } from "./milestones.ts";

export interface CloseoutFinding {
  id: string;
  title: string;
  severity: "blocking" | "non_blocking";
  evidence?: string;
}

export interface FollowUpTaskDraft {
  findingId: string;
  title: string;
  description: string;
  priority: TaskPriority;
  tags: string[];
}

export interface CleanupCandidate {
  relativePath: string;
  reason: string;
}

export interface ProductManagerCloseout {
  summary: string;
  deliveredScope: string[];
  decisions: string[];
  knowledge: string[];
  findings: CloseoutFinding[];
  tasks: FollowUpTaskDraft[];
  completedTaskIds: string[];
  unresolvedTaskIds: string[];
  cleanup: CleanupCandidate[];
  nextRecommendation?: string;
}

export interface CreatedTaskReference {
  id: string;
  title: string;
  backend: "taskplanner" | "adhd";
}

export interface CleanupResult {
  removed: string[];
  rejected: string[];
}

export interface RunCloseoutRecord {
  report: ProductManagerCloseout;
  createdTasks: CreatedTaskReference[];
  cleanup: CleanupResult;
  validationErrors: string[];
  completedAt: string;
}

import type {
  MilestoneFeatureProposal,
  MilestoneProposal,
  MilestoneTaskDraft,
  TaskPriority,
} from "@adhd/core";

const PLAN_BLOCK = /```adhd-milestone-plan\s*([\s\S]*?)```/i;
const PRIORITIES = new Set<TaskPriority>(["P0", "P1", "P2", "P3", "P4"]);

export interface ParsedMilestonePlan {
  proposal?: MilestoneProposal;
  errors: string[];
}

function recordOf(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function stringsOf(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value.flatMap((item) =>
        typeof item === "string" && item.trim() ? [item.trim()] : [],
      ))]
    : [];
}

function taskOf(value: unknown): MilestoneTaskDraft | undefined {
  const task = recordOf(value);
  if (!task) return undefined;
  const id = typeof task.id === "string" ? task.id.trim() : "";
  const title = typeof task.title === "string" ? task.title.trim() : "";
  const description =
    typeof task.description === "string" ? task.description.trim() : "";
  const priority = task.priority;
  if (
    !id ||
    !title ||
    !description ||
    typeof priority !== "string" ||
    !PRIORITIES.has(priority as TaskPriority)
  ) {
    return undefined;
  }
  return {
    id,
    title,
    description,
    priority: priority as TaskPriority,
    tags: stringsOf(task.tags),
  };
}

function featureOf(value: unknown): MilestoneFeatureProposal | undefined {
  const feature = recordOf(value);
  if (!feature) return undefined;
  const id = typeof feature.id === "string" ? feature.id.trim() : "";
  const title = typeof feature.title === "string" ? feature.title.trim() : "";
  const description =
    typeof feature.description === "string" ? feature.description.trim() : "";
  const acceptanceCriteria = stringsOf(feature.acceptanceCriteria);
  const existingTaskIds = stringsOf(feature.existingTaskIds);
  const rawTasks = Array.isArray(feature.taskDrafts) ? feature.taskDrafts : [];
  const taskDrafts = rawTasks.flatMap((task) => {
    const parsed = taskOf(task);
    return parsed ? [parsed] : [];
  });
  if (
    !id ||
    !title ||
    !description ||
    acceptanceCriteria.length === 0 ||
    taskDrafts.length !== rawTasks.length ||
    existingTaskIds.length + taskDrafts.length === 0
  ) {
    return undefined;
  }
  return {
    id,
    title,
    description,
    acceptanceCriteria,
    existingTaskIds,
    taskDrafts,
  };
}

export function parseMilestonePlan(
  output: string,
  revision: number,
  createdAt: string,
): ParsedMilestonePlan {
  const block = PLAN_BLOCK.exec(output)?.[1];
  if (!block) {
    return { errors: ["Missing fenced adhd-milestone-plan JSON block"] };
  }
  let value: unknown;
  try {
    value = JSON.parse(block);
  } catch {
    return { errors: ["adhd-milestone-plan block is not valid JSON"] };
  }
  const record = recordOf(value);
  const name = typeof record?.name === "string" ? record.name.trim() : "";
  const goal = typeof record?.goal === "string" ? record.goal.trim() : "";
  const rawFeatures = Array.isArray(record?.features) ? record.features : [];
  const features = rawFeatures.flatMap((feature) => {
    const parsed = featureOf(feature);
    return parsed ? [parsed] : [];
  });
  const uniqueFeatureIds = new Set(features.map((feature) => feature.id));
  const taskIds = features.flatMap((feature) =>
    feature.taskDrafts.map((task) => task.id),
  );
  if (
    !name ||
    !goal ||
    features.length === 0 ||
    features.length !== rawFeatures.length ||
    uniqueFeatureIds.size !== features.length ||
    new Set(taskIds).size !== taskIds.length
  ) {
    return {
      errors: [
        "Milestone plan requires a name, goal, unique valid features, acceptance criteria, and linked or drafted tasks",
      ],
    };
  }
  return {
    proposal: { revision, name, goal, features, createdAt },
    errors: [],
  };
}

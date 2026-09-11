import type { TaskPriority } from "@isotopy/core";
import { Priority } from "@smekai/taskplanner";
import type { Task } from "@smekai/taskplanner";

export function toBoardPriority(priority: TaskPriority): Priority {
  return Priority[priority];
}

export function taskIdForMarker(tasks: Iterable<Task>, marker: string): string | undefined {
  for (const task of tasks) {
    if (task.description.includes(marker)) {
      return task.id;
    }
  }
  return undefined;
}

export function nextTaskNumber(
  idPrefix: string,
  configuredNextId: number,
  tasks: Iterable<Task>,
): number {
  const numbers = [...tasks].flatMap((task) => {
    const suffix = task.id.startsWith(`${idPrefix}-`)
      ? Number(task.id.slice(idPrefix.length + 1))
      : Number.NaN;
    return Number.isFinite(suffix) ? [suffix + 1] : [];
  });
  return Math.max(configuredNextId, ...numbers, 1);
}

export function isDateBlocked(waitingUntil: string | undefined, today: string): boolean {
  return waitingUntil !== undefined && waitingUntil > today;
}

export function taskSkipReason(task: Task, today: string): string | undefined {
  if (task.assignee) {
    return `assigned to @${task.assignee} — theirs to start, not the team's`;
  }
  return isDateBlocked(task.waitingUntil, today)
    ? `blocked until ${task.waitingUntil ?? ""} on something outside the repository`
    : undefined;
}

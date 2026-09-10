import { TASK_PRIORITIES } from "@isotopy/core";
import type { TaskPriority } from "@isotopy/core";
import { Priority } from "@smekai/taskplanner";
import type { Task } from "@smekai/taskplanner";

const FALLBACK_PRIORITY: TaskPriority = "P2";

export function toBoardPriority(priority: TaskPriority): Priority {
  return Priority[priority];
}

export function fromBoardPriority(priority: Priority): TaskPriority {
  const known = TASK_PRIORITIES.find((candidate) => candidate === priority);
  return known ?? FALLBACK_PRIORITY;
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

// Two axes, two reasons. A task assigned to a person is not the team's to start;
// a date-blocked one is nobody's yet. One reason covering both would leave the run
// log unable to say which rule applied.
export function taskSkipReason(task: Task, today: string): string | undefined {
  if (task.assignee) {
    return `assigned to @${task.assignee} — theirs to start, not the team's`;
  }
  return isDateBlocked(task.waitingUntil, today)
    ? `blocked until ${task.waitingUntil ?? ""} on something outside the repository`
    : undefined;
}

import type { TaskPriority } from "@isotopy/core";
import { Priority, isWaiting } from "@smekai/taskplanner";
import type { Task } from "@smekai/taskplanner";

export function toBoardPriority(priority: TaskPriority): Priority {
  return Priority[priority];
}

export function taskSkipReason(task: Task, now: Date): string | undefined {
  if (task.assignee) {
    return `assigned to @${task.assignee} — theirs to start, not the team's`;
  }
  return isWaiting(task.waitingUntil, now)
    ? `blocked until ${task.waitingUntil ?? ""} on something outside the repository`
    : undefined;
}

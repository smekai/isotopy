import type { TaskPriority } from "@isotopy/core";
import { Priority, isWaiting } from "@smekai/taskplanner";
import type { Task } from "@smekai/taskplanner";

// Identity is read from the raw text, not from parsed tasks: a section TaskPlanner
// refuses is still a task whose id must not be reissued and whose marker must not
// be missed, or a re-run mints a duplicate of work already on the board.
const TASK_HEADING = /^##\s+([A-Za-z]+-\d+):/gm;

export function toBoardPriority(priority: TaskPriority): Priority {
  return Priority[priority];
}

export function taskIdsIn(texts: Iterable<string>): Set<string> {
  const ids = new Set<string>();
  for (const text of texts) {
    for (const match of text.matchAll(TASK_HEADING)) {
      ids.add(match[1]!);
    }
  }
  return ids;
}

export function taskIdForMarker(texts: Iterable<string>, marker: string): string | undefined {
  for (const text of texts) {
    const at = text.indexOf(marker);
    if (at !== -1) {
      return [...text.slice(0, at).matchAll(TASK_HEADING)].at(-1)?.[1];
    }
  }
  return undefined;
}

export function nextTaskNumber(
  idPrefix: string,
  configuredNextId: number,
  texts: Iterable<string>,
): number {
  const heading = new RegExp(`^##\\s+${escaped(idPrefix)}-(\\d+):`, "gm");
  const numbers = [...texts].flatMap((text) =>
    [...text.matchAll(heading)].map((match) => Number(match[1]) + 1),
  );
  return Math.max(configuredNextId, ...numbers, 1);
}

export function taskSkipReason(task: Task, now: Date): string | undefined {
  if (task.assignee) {
    return `assigned to @${task.assignee} — theirs to start, not the team's`;
  }
  return isWaiting(task.waitingUntil, now)
    ? `blocked until ${task.waitingUntil ?? ""} on something outside the repository`
    : undefined;
}

function escaped(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

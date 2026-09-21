import type { ParseIssue, Task } from "@smekai/taskplanner";
import { structuralText } from "./format.ts";
import { taskSkipReason } from "../rules/task-board.ts";

export interface BoardStateTasks {
  name: string;
  tasks: Task[];
  issues?: ParseIssue[];
}

const DIGEST_TASK_LIMIT = 320;

const DIGEST_ISSUE_LIMIT = 5;

export function boardHeading(name: string): string {
  return `# ${structuralText(name)}\n`;
}

export function renderBoardDigest(
  backend: string,
  states: BoardStateTasks[],
  now: Date,
): string {
  const lines = states.flatMap(({ name, tasks }) =>
    tasks.length > 0
      ? [`${structuralText(name)}:`, ...tasks.map((task) => `- ${digestLine(task, now)}`)]
      : [],
  );
  const board =
    lines.length > 0
      ? `Existing ${structuralText(backend)} tasks:\n${lines.join("\n")}`
      : `The ${structuralText(backend)} task board is empty.`;
  return [board, ...unreadableSections(states)].join("\n");
}

// A section the parser refuses is kept on the board verbatim but is not a task, so
// without this the agent reads a board that silently omits it.
function unreadableSections(states: BoardStateTasks[]): string[] {
  const issues = states.flatMap(({ name, issues }) =>
    (issues ?? []).map(
      (issue) =>
        `- ${structuralText(name)} line ${issue.line}: ` +
        structuralText(issue.message).slice(0, DIGEST_TASK_LIMIT),
    ),
  );
  if (issues.length === 0) {
    return [];
  }
  const shown = issues.slice(0, DIGEST_ISSUE_LIMIT);
  const remaining = issues.length - shown.length;
  return [
    "Sections left on the board that could not be read as tasks:",
    ...shown,
    ...(remaining > 0 ? [`- and ${remaining} more`] : []),
  ];
}

export function prependWorkLogEntries(current: string, entries: string): string {
  const lineEnd = current.indexOf("\n");
  return lineEnd === -1
    ? `${current}\n\n${entries}`
    : `${current.slice(0, lineEnd + 1)}\n${entries}${current.slice(lineEnd + 1)}`;
}

export function renderWorkLogEntry(id: string, date: string, runId: string): string {
  return [
    `## ${structuralText(id)} — ${structuralText(date)}`,
    `**What:** Completed by Full Delivery run ${structuralText(runId)}.`,
    "**Outcome:** Evidence and follow-ups are recorded in the run closeout.",
    "",
    "---",
    "",
  ].join("\n");
}

function digestLine(task: Task, now: Date): string {
  const description = structuralText(task.description).slice(0, DIGEST_TASK_LIMIT);
  return [
    `${task.id}: ${structuralText(task.title)}`,
    ...marks(task, now),
    ...(description ? [`— ${description}`] : []),
  ].join(" ");
}

function marks(task: Task, now: Date): string[] {
  const skip = taskSkipReason(task, now);
  return [
    `[${task.priority}]`,
    ...(task.epic ? [`epic ${structuralText(task.epic)}`] : []),
    ...(skip ? [`(${skip})`] : []),
  ];
}

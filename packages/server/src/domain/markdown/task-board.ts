import type { Task } from "@smekai/taskplanner";
import { lineEndingOf, withLineEnding } from "./line-endings.ts";
import { structuralText } from "./format.ts";

export type BoardInsertPosition = "top" | "bottom";

export interface BoardStateTasks {
  name: string;
  tasks: Task[];
}

export interface TakenTaskSection {
  text: string;
  section?: string;
}

const DIGEST_TASK_LIMIT = 320;

export function boardHeading(name: string): string {
  return `# ${structuralText(name)}\n`;
}

export function renderBoardDigest(
  backend: string,
  states: BoardStateTasks[],
  today: string,
): string {
  const lines = states.flatMap(({ name, tasks }) =>
    tasks.length > 0
      ? [`${structuralText(name)}:`, ...tasks.map((task) => `- ${digestLine(task, today)}`)]
      : [],
  );
  return lines.length > 0
    ? `Existing ${structuralText(backend)} tasks:\n${lines.join("\n")}`
    : `The ${structuralText(backend)} task board is empty.`;
}

export function insertTaskSection(
  current: string,
  section: string,
  position: BoardInsertPosition,
): string {
  const lineEnding = lineEndingOf(current);
  const rendered = withLineEnding(section, lineEnding);
  if (position === "bottom") {
    const separator = current.endsWith(lineEnding)
      ? current.endsWith(`${lineEnding}${lineEnding}`)
        ? ""
        : lineEnding
      : `${lineEnding}${lineEnding}`;
    return `${current}${separator}${rendered}`;
  }
  const lineEnd = current.indexOf(lineEnding);
  return lineEnd === -1
    ? `${current}${lineEnding}${lineEnding}${rendered}`
    : `${current.slice(0, lineEnd + lineEnding.length)}${lineEnding}${rendered}${current.slice(lineEnd + lineEnding.length)}`;
}

export function takeTaskSection(text: string, id: string): TakenTaskSection {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const heading = new RegExp(`^##\\s+${escaped}:.*$`, "m").exec(text);
  if (!heading) return { text };
  const separator = /^---[ \t]*(?:\r?\n|$)/gm;
  separator.lastIndex = heading.index + heading[0].length;
  const end = separator.exec(text);
  if (!end) return { text };
  const sectionEnd = end.index + end[0].length;
  return {
    text: `${text.slice(0, heading.index)}${text.slice(sectionEnd)}`,
    section: text.slice(heading.index, sectionEnd),
  };
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

function digestLine(task: Task, today: string): string {
  const description = structuralText(task.description).slice(0, DIGEST_TASK_LIMIT);
  return [
    `${task.id}: ${structuralText(task.title)}`,
    ...marks(task, today),
    ...(description ? [`— ${description}`] : []),
  ].join(" ");
}

function marks(task: Task, today: string): string[] {
  return [
    `[${task.priority}]`,
    ...(task.epic ? [`epic ${structuralText(task.epic)}`] : []),
    ...(task.assignee ? [`@${structuralText(task.assignee)}`] : []),
    ...(task.waitingUntil && task.waitingUntil > today
      ? [`waiting until ${task.waitingUntil}`]
      : []),
  ];
}

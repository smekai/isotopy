import type { TaskPriority } from "@isotopy/core";

export type BoardInsertPosition = "top" | "bottom";

export interface TaskBoardStateContent {
  name: string;
  content: string;
}

export interface TaskSectionInput {
  id: string;
  title: string;
  priority: TaskPriority;
  tags: string[];
  updatedAt: string;
  description: string;
  source: string;
  marker: string;
}

export interface TakenTaskSection {
  text: string;
  section?: string;
}

function structuralText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function bodyText(value: string): string {
  return value.replace(/\r\n/g, "\n").trim();
}

export function lineEndingOf(text: string): "\r\n" | "\n" {
  return text.includes("\r\n") ? "\r\n" : "\n";
}

function withLineEnding(text: string, lineEnding: "\r\n" | "\n"): string {
  return text.replace(/\r\n|\n/g, lineEnding);
}

export function boardHeading(name: string): string {
  return `# ${structuralText(name)}\n`;
}

export function taskSummariesIn(text: string): string[] {
  return text.split(/(?=^##\s+)/m).flatMap((section) => {
    const heading = /^##\s+([A-Za-z]+-\d+):\s+(.+)$/m.exec(section);
    if (!heading?.[1] || !heading[2]) return [];
    const description = section
      .split(/\r?\n/)
      .slice(1)
      .filter(
        (line) =>
          line.trim() &&
          !line.startsWith("**") &&
          !line.startsWith("### ") &&
          line.trim() !== "---" &&
          !line.startsWith("- ["),
      )
      .join(" ")
      .trim()
      .slice(0, 320);
    return [
      `${heading[1]}: ${heading[2].trim()}${description ? ` — ${description}` : ""}`,
    ];
  });
}

export function renderTaskBoardPlanningContext(
  backend: string,
  states: TaskBoardStateContent[],
): string {
  const lines = states.flatMap(({ name, content }) => {
    const tasks = taskSummariesIn(content);
    return tasks.length > 0
      ? [`${structuralText(name)}:`, ...tasks.map((task) => `- ${task}`)]
      : [];
  });
  return lines.length > 0
    ? `Existing ${structuralText(backend)} tasks:\n${lines.join("\n")}`
    : `The ${structuralText(backend)} task board is empty.`;
}

export function taskIdsIn(texts: Iterable<string>): Set<string> {
  const ids = new Set<string>();
  for (const content of texts) {
    for (const match of content.matchAll(/^##\s+([A-Za-z]+-\d+):/gm)) {
      if (match[1]) ids.add(match[1]);
    }
  }
  return ids;
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

export function renderTaskSection(input: TaskSectionInput): string {
  const tags = input.tags.map(structuralText).filter(Boolean);
  const metadata =
    tags.length > 0
      ? `**Priority:** ${input.priority} | **Tags:** ${tags.join(", ")}`
      : `**Priority:** ${input.priority}`;
  return [
    `## ${structuralText(input.id)}: ${structuralText(input.title)}`,
    metadata,
    `**Updated:** ${structuralText(input.updatedAt)}`,
    "",
    bodyText(input.description),
    "",
    `**Isotopy source:** ${structuralText(input.source)}`,
    structuralText(input.marker),
    "",
    "---",
    "",
  ].join("\n");
}

export function nextTaskNumber(
  idPrefix: string,
  configuredNextId: number,
  allText: string,
): number {
  const escaped = idPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const numbers = [
    ...allText.matchAll(new RegExp(`^##\\s+${escaped}-(\\d+):`, "gm")),
  ].map((match) => Number(match[1]));
  return Math.max(
    configuredNextId,
    ...numbers.map((value) => value + 1),
    1,
  );
}

export function existingTaskIdForMarker(
  allText: string,
  sourceMarker: string,
): string | undefined {
  const index = allText.indexOf(sourceMarker);
  if (index === -1) return undefined;
  const before = allText.slice(0, index);
  return [...before.matchAll(/^##\s+([A-Za-z]+-\d+):/gm)].at(-1)?.[1];
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

export function renderWorkLogEntry(
  id: string,
  date: string,
  runId: string,
): string {
  return [
    `## ${structuralText(id)} — ${structuralText(date)}`,
    `**What:** Completed by Full Delivery run ${structuralText(runId)}.`,
    "**Outcome:** Evidence and follow-ups are recorded in the run closeout.",
    "",
    "---",
    "",
  ].join("\n");
}

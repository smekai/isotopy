import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  Milestone,
  MilestoneProposal,
  MilestoneTaskDraft,
} from "@adhd/core";
import type { ProjectPath } from "../paths.ts";
import { nowIso } from "../utils.ts";

interface StateConfig {
  name: string;
  fileName: string;
}

interface BoardConfig {
  idPrefix: string;
  nextId: number;
  states: StateConfig[];
  tags?: string[];
  insertPosition?: "top" | "bottom";
}

interface Board {
  backend: "taskplanner" | "adhd";
  dir: string;
  configPath: string;
  config: BoardConfig;
}

export interface ApprovedTaskLinks {
  backend: Board["backend"];
  featureTaskIds: Record<string, string[]>;
}

async function readText(filePath: string): Promise<string | undefined> {
  return readFile(filePath, "utf8").catch(() => undefined);
}

function isConfig(value: unknown): value is BoardConfig {
  const config = value as Partial<BoardConfig>;
  return (
    typeof value === "object" &&
    value !== null &&
    typeof config.idPrefix === "string" &&
    typeof config.nextId === "number" &&
    Array.isArray(config.states)
  );
}

async function readConfig(configPath: string): Promise<BoardConfig> {
  const value: unknown = JSON.parse(await readFile(configPath, "utf8"));
  if (!isConfig(value)) {
    throw new Error(`Invalid task board config: ${configPath}`);
  }
  return value;
}

async function builtInBoard(projectPath: ProjectPath): Promise<Board> {
  const dir = path.join(projectPath.dataDir, "tasks");
  const configPath = path.join(dir, "config.json");
  await mkdir(dir, { recursive: true });
  const existing = await readText(configPath);
  if (existing) {
    return {
      backend: "adhd",
      dir,
      configPath,
      config: await readConfig(configPath),
    };
  }
  const config: BoardConfig = {
    idPrefix: "TASK",
    nextId: 1,
    states: [
      { name: "Backlog", fileName: "BACKLOG.md" },
      { name: "In Progress", fileName: "IN_PROGRESS.md" },
      { name: "Done", fileName: "DONE.md" },
    ],
    insertPosition: "top",
  };
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
  await Promise.all(
    config.states.map((state) =>
      writeFile(path.join(dir, state.fileName), `# ${state.name}\n`, {
        flag: "wx",
      }).catch(() => undefined),
    ),
  );
  return { backend: "adhd", dir, configPath, config };
}

async function boardFor(projectPath: ProjectPath, create: boolean): Promise<Board | undefined> {
  const taskPlannerConfig = path.join(
    projectPath.root,
    ".tasks",
    "config.json",
  );
  if (await readText(taskPlannerConfig)) {
    return {
      backend: "taskplanner",
      dir: path.dirname(taskPlannerConfig),
      configPath: taskPlannerConfig,
      config: await readConfig(taskPlannerConfig),
    };
  }
  return create ? builtInBoard(projectPath) : undefined;
}

async function stateTexts(board: Board): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  await Promise.all(
    board.config.states.map(async (state) => {
      const content =
        (await readText(path.join(board.dir, state.fileName))) ??
        `# ${state.name}\n`;
      result.set(state.name, content);
    }),
  );
  return result;
}

function idsIn(text: string): string[] {
  return [...text.matchAll(/^##\s+([A-Za-z]+-\d+):\s+(.+)$/gm)].map(
    (match) => `${match[1]}: ${match[2]}`,
  );
}

export async function taskBoardPlanningContext(
  projectPath: ProjectPath,
): Promise<string> {
  const board = await boardFor(projectPath, false);
  if (!board) {
    return "No existing task board is configured.";
  }
  const texts = await stateTexts(board);
  const lines = [...texts.entries()].flatMap(([state, content]) => {
    const tasks = idsIn(content);
    return tasks.length > 0
      ? [`${state}:`, ...tasks.map((task) => `- ${task}`)]
      : [];
  });
  return lines.length > 0
    ? `Existing ${board.backend} tasks:\n${lines.join("\n")}`
    : `The ${board.backend} task board is empty.`;
}

function taskIdSet(texts: Map<string, string>): Set<string> {
  const ids = new Set<string>();
  for (const content of texts.values()) {
    for (const match of content.matchAll(/^##\s+([A-Za-z]+-\d+):/gm)) {
      if (match[1]) ids.add(match[1]);
    }
  }
  return ids;
}

function fingerprint(
  milestoneId: string,
  featureId: string,
  taskId: string,
): string {
  return createHash("sha256")
    .update(`${milestoneId}:${featureId}:${taskId}`)
    .digest("hex")
    .slice(0, 16);
}

function marker(value: string): string {
  return `<!-- ADHD-MILESTONE-TASK:${value} -->`;
}

function backlogState(board: Board): StateConfig {
  return (
    board.config.states.find(
      (state) => state.name.toLowerCase() === "backlog",
    ) ?? { name: "Backlog", fileName: "BACKLOG.md" }
  );
}

function insertAtBoardPosition(
  current: string,
  section: string,
  position: BoardConfig["insertPosition"],
): string {
  if (position === "bottom") {
    return `${current.trimEnd()}\n\n${section}`;
  }
  const lineEnd = current.indexOf("\n");
  return lineEnd === -1
    ? `${current}\n\n${section}`
    : `${current.slice(0, lineEnd + 1)}\n${section}${current.slice(lineEnd + 1)}`;
}

function taskSection(
  board: Board,
  id: string,
  draft: MilestoneTaskDraft,
  sourceMarker: string,
  milestone: Milestone,
  featureId: string,
): string {
  const allowed = new Set(board.config.tags ?? []);
  const tags = draft.tags.filter(
    (tag) => allowed.size === 0 || allowed.has(tag),
  );
  const metadata =
    tags.length > 0
      ? `**Priority:** ${draft.priority} | **Tags:** ${tags.join(", ")}`
      : `**Priority:** ${draft.priority}`;
  return [
    `## ${id}: ${draft.title}`,
    metadata,
    `**Updated:** ${nowIso().slice(0, 16).replace("T", " ")}`,
    "",
    draft.description,
    "",
    `**ADHD source:** milestone ${milestone.id} · feature ${featureId}`,
    sourceMarker,
    "",
    "---",
    "",
  ].join("\n");
}

function nextNumber(board: Board, allText: string): number {
  const escaped = board.config.idPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const numbers = [...allText.matchAll(new RegExp(`^##\\s+${escaped}-(\\d+):`, "gm"))]
    .map((match) => Number(match[1]));
  return Math.max(board.config.nextId, ...numbers.map((value) => value + 1), 1);
}

function existingIdForMarker(allText: string, sourceMarker: string): string | undefined {
  const index = allText.indexOf(sourceMarker);
  if (index === -1) return undefined;
  const before = allText.slice(0, index);
  return [...before.matchAll(/^##\s+([A-Za-z]+-\d+):/gm)].at(-1)?.[1];
}

export async function approveMilestoneTasks(
  projectPath: ProjectPath,
  milestone: Milestone,
  proposal: MilestoneProposal,
): Promise<ApprovedTaskLinks> {
  const board = await boardFor(projectPath, true);
  if (!board) {
    throw new Error("Task board is unavailable");
  }
  const texts = await stateTexts(board);
  const knownIds = taskIdSet(texts);
  const requestedIds = proposal.features.flatMap(
    (feature) => feature.existingTaskIds,
  );
  const missing = [...new Set(requestedIds)].filter((id) => !knownIds.has(id));
  if (missing.length > 0) {
    throw new Error(`Existing task IDs were not found: ${missing.join(", ")}`);
  }

  const backlog = backlogState(board);
  let backlogText =
    texts.get(backlog.name) ?? (await readText(path.join(board.dir, backlog.fileName))) ?? "# Backlog\n";
  let allText = [...texts.values()].join("\n");
  let next = nextNumber(board, allText);
  const featureTaskIds: Record<string, string[]> = {};

  for (const feature of proposal.features) {
    const ids = [...feature.existingTaskIds];
    for (const draft of feature.taskDrafts) {
      const sourceMarker = marker(
        fingerprint(milestone.id, feature.id, draft.id),
      );
      let id = existingIdForMarker(allText, sourceMarker);
      if (!id) {
        id = `${board.config.idPrefix}-${String(next).padStart(3, "0")}`;
        const section = taskSection(
          board,
          id,
          draft,
          sourceMarker,
          milestone,
          feature.id,
        );
        backlogText = insertAtBoardPosition(
          backlogText,
          section,
          board.config.insertPosition,
        );
        allText += `\n${section}`;
        next += 1;
      }
      draft.createdTaskId = id;
      ids.push(id);
    }
    featureTaskIds[feature.id] = [...new Set(ids)];
  }

  await writeFile(path.join(board.dir, backlog.fileName), backlogText);
  board.config.nextId = next;
  await writeFile(
    board.configPath,
    `${JSON.stringify(board.config, null, 2)}\n`,
  );
  return { backend: board.backend, featureTaskIds };
}

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  CreatedTaskReference,
  FollowUpTaskDraft,
  Milestone,
  MilestoneProposal,
  MilestoneTaskDraft,
  RunState,
} from "@adhd/core";
import {
  boardHeading,
  existingTaskIdForMarker,
  insertTaskSection,
  nextTaskNumber,
  renderTaskBoardPlanningContext,
  renderTaskSection,
  renderWorkLogEntry,
  takeTaskSection,
  taskIdsIn,
} from "../domain/markdown/task-board.ts";
import {
  boardConfigSchema,
  ownedBoardConfigSchema,
  type BoardConfig,
  type StateConfig,
} from "../domain/task-board-config.ts";
import {
  formatValidationIssues,
  parseJson,
} from "../domain/validation.ts";
import type { ProjectPath } from "../paths.ts";
import { nowIso } from "../utils.ts";

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

async function readConfig(
  configPath: string,
  external: boolean,
): Promise<BoardConfig> {
  const parsed = parseJson(
    external ? boardConfigSchema : ownedBoardConfigSchema,
    await readFile(configPath, "utf8"),
  );
  if (!parsed.ok) {
    throw new Error(
      `Invalid task board config ${configPath}: ${formatValidationIssues(parsed.issues)}`,
    );
  }
  return parsed.value;
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
      config: await readConfig(configPath, false),
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
      writeFile(path.join(dir, state.fileName), boardHeading(state.name), {
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
      config: await readConfig(taskPlannerConfig, true),
    };
  }
  const builtInConfig = path.join(projectPath.dataDir, "tasks", "config.json");
  if (await readText(builtInConfig)) {
    return {
      backend: "adhd",
      dir: path.dirname(builtInConfig),
      configPath: builtInConfig,
      config: await readConfig(builtInConfig, false),
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
        boardHeading(state.name);
      result.set(state.name, content);
    }),
  );
  return result;
}

export async function taskBoardPlanningContext(
  projectPath: ProjectPath,
): Promise<string> {
  const board = await boardFor(projectPath, false);
  if (!board) {
    return "No existing task board is configured.";
  }
  const texts = await stateTexts(board);
  return renderTaskBoardPlanningContext(
    board.backend,
    [...texts].map(([name, content]) => ({ name, content })),
  );
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

function milestoneTaskSection(
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
  return renderTaskSection({
    id,
    title: draft.title,
    priority: draft.priority,
    tags,
    updatedAt: nowIso().slice(0, 16).replace("T", " "),
    description: draft.description,
    source: `milestone ${milestone.id} · feature ${featureId}`,
    marker: sourceMarker,
  });
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
  const knownIds = taskIdsIn(texts.values());
  const requestedIds = proposal.features.flatMap(
    (feature) => feature.existingTaskIds,
  );
  const missing = [...new Set(requestedIds)].filter((id) => !knownIds.has(id));
  if (missing.length > 0) {
    throw new Error(`Existing task IDs were not found: ${missing.join(", ")}`);
  }

  const backlog = backlogState(board);
  let backlogText =
    texts.get(backlog.name) ??
    (await readText(path.join(board.dir, backlog.fileName))) ??
    boardHeading("Backlog");
  let allText = [...texts.values()].join("\n");
  let next = nextTaskNumber(
    board.config.idPrefix,
    board.config.nextId,
    allText,
  );
  const featureTaskIds: Record<string, string[]> = {};

  for (const feature of proposal.features) {
    const ids = [...feature.existingTaskIds];
    for (const draft of feature.taskDrafts) {
      const sourceMarker = marker(
        fingerprint(milestone.id, feature.id, draft.id),
      );
      let id = existingTaskIdForMarker(allText, sourceMarker);
      if (!id) {
        id = `${board.config.idPrefix}-${String(next).padStart(3, "0")}`;
        const section = milestoneTaskSection(
          board,
          id,
          draft,
          sourceMarker,
          milestone,
          feature.id,
        );
        backlogText = insertTaskSection(
          backlogText,
          section,
          board.config.insertPosition ?? "top",
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

function findingFingerprint(run: RunState, findingId: string): string {
  return createHash("sha256")
    .update(
      [
        run.milestoneId ?? "no-milestone",
        run.featureId ?? "no-feature",
        run.id,
        findingId,
      ].join(":"),
    )
    .digest("hex")
    .slice(0, 16);
}

function followUpTaskSection(
  board: Board,
  id: string,
  task: FollowUpTaskDraft,
  sourceMarker: string,
  run: RunState,
): string {
  const allowed = new Set(board.config.tags ?? []);
  const tags = task.tags.filter(
    (tag) => allowed.size === 0 || allowed.has(tag),
  );
  const source = [
    run.milestoneId ? `milestone ${run.milestoneId}` : undefined,
    run.featureId ? `feature ${run.featureId}` : undefined,
    `run ${run.id}`,
    `finding ${task.findingId}`,
  ]
    .filter((part): part is string => Boolean(part))
    .join(" · ");
  return renderTaskSection({
    id,
    title: task.title,
    priority: task.priority,
    tags,
    updatedAt: nowIso().slice(0, 16).replace("T", " "),
    description: task.description,
    source,
    marker: sourceMarker,
  });
}

export async function createFollowUpTasks(
  projectPath: ProjectPath,
  run: RunState,
  tasks: FollowUpTaskDraft[],
): Promise<CreatedTaskReference[]> {
  if (tasks.length === 0) return [];
  const board = await boardFor(projectPath, true);
  if (!board) throw new Error("Task board is unavailable");
  const texts = await stateTexts(board);
  const backlog = backlogState(board);
  let backlogText =
    texts.get(backlog.name) ??
    (await readText(path.join(board.dir, backlog.fileName))) ??
    boardHeading("Backlog");
  let allText = [...texts.values()].join("\n");
  let next = nextTaskNumber(
    board.config.idPrefix,
    board.config.nextId,
    allText,
  );
  const created: CreatedTaskReference[] = [];

  for (const task of tasks) {
    const sourceMarker = `<!-- ADHD-FINDING:${findingFingerprint(run, task.findingId)} -->`;
    const existingId = existingTaskIdForMarker(allText, sourceMarker);
    if (existingId) {
      continue;
    }
    const id = `${board.config.idPrefix}-${String(next).padStart(3, "0")}`;
    const section = followUpTaskSection(
      board,
      id,
      task,
      sourceMarker,
      run,
    );
    backlogText = insertTaskSection(
      backlogText,
      section,
      board.config.insertPosition ?? "top",
    );
    allText += `\n${section}`;
    created.push({ id, title: task.title, backend: board.backend });
    next += 1;
  }
  if (created.length === 0) return [];
  await writeFile(path.join(board.dir, backlog.fileName), backlogText);
  board.config.nextId = next;
  await writeFile(
    board.configPath,
    `${JSON.stringify(board.config, null, 2)}\n`,
  );
  return created;
}

function stateFor(board: Board, name: string): StateConfig | undefined {
  return board.config.states.find(
    (state) => state.name.toLowerCase() === name.toLowerCase(),
  );
}

async function appendWorkLog(
  board: Board,
  runId: string,
  ids: string[],
): Promise<void> {
  const target = path.join(board.dir, "WORK_LOG.md");
  const current = await readText(target);
  if (!current) return;
  const entries = ids
    .map((id) => renderWorkLogEntry(id, nowIso().slice(0, 10), runId))
    .join("\n");
  await writeFile(target, insertTaskSection(current, entries, "top"));
}

export async function transitionTasks(
  projectPath: ProjectPath,
  ids: string[],
  targetStateName: "In Progress" | "Done",
  runId: string,
): Promise<string[]> {
  if (ids.length === 0) return [];
  const board = await boardFor(projectPath, false);
  if (!board) return [];
  const targetState = stateFor(board, targetStateName);
  if (!targetState) return [];
  const targetPath = path.join(board.dir, targetState.fileName);
  let destination =
    (await readText(targetPath)) ?? boardHeading(targetStateName);
  const moved: string[] = [];

  for (const id of [...new Set(ids)]) {
    if (destination.includes(`## ${id}:`)) continue;
    let section: string | undefined;
    for (const state of board.config.states) {
      if (state.fileName === targetState.fileName) continue;
      const sourcePath = path.join(board.dir, state.fileName);
      const current = await readText(sourcePath);
      if (!current) continue;
      const taken = takeTaskSection(current, id);
      if (!taken.section) continue;
      await writeFile(sourcePath, taken.text);
      section = taken.section;
      break;
    }
    if (!section) continue;
    destination = insertTaskSection(destination, section, "top");
    moved.push(id);
  }
  if (moved.length === 0) return [];
  await writeFile(targetPath, destination);
  if (targetStateName === "Done") {
    await appendWorkLog(board, runId, moved);
  }
  return moved;
}

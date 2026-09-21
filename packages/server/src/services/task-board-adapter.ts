import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  CreatedTaskReference,
  FollowUpTaskDraft,
  Milestone,
  MilestoneProposal,
  MilestoneTaskDraft,
  RunState,
} from "@isotopy/core";
import { parseTasks, serializeBoard, taskIdsIn } from "@smekai/taskplanner";
import type { BoardSegment, Task } from "@smekai/taskplanner";
import {
  boardHeading,
  prependWorkLogEntries,
  renderBoardDigest,
  renderWorkLogEntry,
} from "../domain/markdown/task-board.ts";
import { toBoardPriority } from "../domain/rules/task-board.ts";
import {
  boardConfigSchema,
  ownedBoardConfigSchema,
  type BoardConfig,
  type StateConfig,
} from "../schemas/task-board-config.ts";
import { formatValidationIssues, parseJson } from "../domain/validation.ts";
import type { ProjectPath } from "../paths.ts";
import { getOrCreate } from "../utils/get-or-create.ts";
import { nowIso } from "../utils/time.ts";

export interface ApprovedTaskLinks {
  backend: "taskplanner" | "isotopy";
  featureTaskIds: Record<string, string[]>;
}

const BOARD_DIR = ".tasks";

const ARCHIVE_DIR = "archive";

const SOURCE_ATTRIBUTE = "Isotopy source";

const ORIGIN_ATTRIBUTE = "Isotopy origin";

const adapters = new Map<string, TaskBoardAdapter>();

export function taskBoardFor(projectPath: ProjectPath): TaskBoardAdapter {
  return getOrCreate(adapters, projectPath.root, () => new TaskBoardAdapter(projectPath));
}

export class TaskBoardAdapter {
  private location?: BoardLocation;

  constructor(private readonly projectPath: ProjectPath) {}

  async boardDigest(): Promise<string> {
    const board = await this.board(false);
    if (!board) {
      return "No existing task board is configured.";
    }
    const files = await stateFiles(board);
    const states = board.config.states.map((state) => ({
      name: state.name,
      tasks: files.get(state.name)?.tasks ?? [],
    }));
    return renderBoardDigest(board.backend, states, new Date());
  }

  async approveMilestoneTasks(
    milestone: Milestone,
    proposal: MilestoneProposal,
  ): Promise<ApprovedTaskLinks> {
    const board = await this.board(true);
    if (!board) {
      throw new Error("Task board is unavailable");
    }
    const files = await stateFiles(board);
    const known = await knownBoard(board, files);
    const requestedIds = proposal.features.flatMap((feature) => feature.existingTaskIds);
    const missing = [...new Set(requestedIds)].filter((id) => !known.ids.has(id));
    if (missing.length > 0) {
      throw new Error(`Existing task IDs were not found: ${missing.join(", ")}`);
    }

    const backlog = backlogState(board);
    const backlogFile = fileFor(files, backlog);
    let next = board.config.nextId;
    const featureTaskIds: Record<string, string[]> = {};

    for (const feature of proposal.features) {
      const ids = [...feature.existingTaskIds];
      for (const draft of feature.taskDrafts) {
        const origin = fingerprint(milestone.id, feature.id, draft.id);
        let id = taskIdForOrigin(known.tasks, origin);
        if (!id) {
          const allocated = allocate(board, known.ids, next);
          id = allocated.id;
          next = allocated.next;
          const task = milestoneTask(board, id, draft, origin, milestone, feature.id);
          backlogFile.tasks = placed(backlogFile.tasks, task, board.config.insertPosition);
          remember(known, task);
        }
        draft.createdTaskId = id;
        ids.push(id);
      }
      featureTaskIds[feature.id] = [...new Set(ids)];
    }

    await writeBoardFile(path.join(board.dir, backlog.fileName), backlogFile);
    await this.writeNextId(board, next);
    return { backend: board.backend, featureTaskIds };
  }

  async createFollowUpTasks(
    run: RunState,
    tasks: FollowUpTaskDraft[],
  ): Promise<CreatedTaskReference[]> {
    if (tasks.length === 0) return [];
    const board = await this.board(true);
    if (!board) throw new Error("Task board is unavailable");
    const files = await stateFiles(board);
    const known = await knownBoard(board, files);
    const backlog = backlogState(board);
    const backlogFile = fileFor(files, backlog);
    let next = board.config.nextId;
    const created: CreatedTaskReference[] = [];

    for (const draft of tasks) {
      const origin = findingFingerprint(run, draft.findingId);
      if (taskIdForOrigin(known.tasks, origin)) {
        continue;
      }
      const allocated = allocate(board, known.ids, next);
      next = allocated.next;
      const task = followUpTask(board, allocated.id, draft, origin, run);
      backlogFile.tasks = placed(backlogFile.tasks, task, board.config.insertPosition);
      remember(known, task);
      created.push({ id: allocated.id, title: draft.title, backend: board.backend });
    }
    if (created.length === 0) return [];
    await writeBoardFile(path.join(board.dir, backlog.fileName), backlogFile);
    await this.writeNextId(board, next);
    return created;
  }

  async transitionTasks(
    ids: string[],
    targetStateName: "In Progress" | "Done",
    runId: string,
  ): Promise<string[]> {
    if (ids.length === 0) return [];
    const board = await this.board(false);
    if (!board) return [];
    const targetState = stateFor(board, targetStateName);
    if (!targetState) return [];
    const targetPath = path.join(board.dir, targetState.fileName);
    const destination = (await readBoardFile(targetPath)) ?? emptyBoard(targetStateName);
    const archived = await archiveIds(board);
    const moved: string[] = [];

    for (const id of [...new Set(ids)]) {
      if (destination.ids.has(id) || archived.has(id)) continue;
      const task = await this.takeTask(board, targetState, id);
      if (!task) continue;
      destination.tasks = [task, ...destination.tasks];
      destination.ids.add(id);
      moved.push(id);
    }
    if (moved.length === 0) return [];
    await writeBoardFile(targetPath, destination);
    if (targetStateName === "Done") {
      await appendWorkLog(board, runId, moved);
    }
    return moved;
  }

  private async takeTask(
    board: Board,
    targetState: StateConfig,
    id: string,
  ): Promise<Task | undefined> {
    for (const state of board.config.states) {
      if (state.fileName === targetState.fileName) continue;
      const sourcePath = path.join(board.dir, state.fileName);
      const source = await readBoardFile(sourcePath);
      const task = source?.tasks.find((candidate) => candidate.id === id);
      if (!source || !task) continue;
      await writeBoardFile(sourcePath, {
        ...source,
        tasks: source.tasks.filter((candidate) => candidate.id !== id),
      });
      return task;
    }
    return undefined;
  }

  private async board(create: boolean): Promise<Board | undefined> {
    const location = this.location ?? (await this.resolveLocation(create));
    if (!location) {
      return undefined;
    }
    this.location = location;
    return {
      ...location,
      config: await readConfig(location.configPath, location.backend === "taskplanner"),
    };
  }

  private async resolveLocation(create: boolean): Promise<BoardLocation | undefined> {
    const candidates: BoardLocation[] = [
      locationAt(path.join(this.projectPath.root, BOARD_DIR), "taskplanner"),
      locationAt(path.join(this.projectPath.dataDir, BOARD_DIR), "isotopy"),
    ];
    for (const candidate of candidates) {
      if (await readText(candidate.configPath)) {
        return candidate;
      }
    }
    return create ? createBuiltInBoard(this.projectPath) : undefined;
  }

  private async writeNextId(board: Board, nextId: number): Promise<void> {
    await writeFile(
      board.configPath,
      `${JSON.stringify({ ...board.config, nextId }, null, 2)}\n`,
    );
  }
}

interface BoardLocation {
  backend: "taskplanner" | "isotopy";
  dir: string;
  configPath: string;
}

interface Board extends BoardLocation {
  config: BoardConfig;
}

interface BoardFile {
  segments: BoardSegment[];
  tasks: Task[];
  ids: Set<string>;
}

interface KnownBoard {
  tasks: Task[];
  ids: Set<string>;
}

function locationAt(dir: string, backend: BoardLocation["backend"]): BoardLocation {
  return { backend, dir, configPath: path.join(dir, "config.json") };
}

async function readText(filePath: string): Promise<string | undefined> {
  return readFile(filePath, "utf8").catch(() => undefined);
}

function parsedBoard(raw: string): BoardFile {
  const { segments, tasks } = parseTasks(raw);
  return { segments, tasks, ids: taskIdsIn(raw) };
}

async function readBoardFile(filePath: string): Promise<BoardFile | undefined> {
  const raw = await readText(filePath);
  return raw === undefined ? undefined : parsedBoard(raw);
}

function writeBoardFile(filePath: string, file: BoardFile): Promise<void> {
  return writeFile(filePath, serializeBoard(file.segments, file.tasks));
}

function emptyBoard(stateName: string): BoardFile {
  return parsedBoard(boardHeading(stateName));
}

function placed(tasks: Task[], task: Task, position: BoardConfig["insertPosition"]): Task[] {
  return position === "bottom" ? [...tasks, task] : [task, ...tasks];
}

// The persisted nextId is the source of truth, but a board edited by hand may hold an
// id it never advanced past, and reissuing one would put two tasks under one number.
function allocate(
  board: Board,
  knownIds: Set<string>,
  from: number,
): { id: string; next: number } {
  let number = from;
  let id = `${board.config.idPrefix}-${String(number).padStart(3, "0")}`;
  while (knownIds.has(id)) {
    number += 1;
    id = `${board.config.idPrefix}-${String(number).padStart(3, "0")}`;
  }
  return { id, next: number + 1 };
}

function remember(known: KnownBoard, task: Task): void {
  known.tasks.push(task);
  known.ids.add(task.id);
}

function taskIdForOrigin(tasks: Iterable<Task>, origin: string): string | undefined {
  for (const task of tasks) {
    if (task.attributes?.[ORIGIN_ATTRIBUTE] === origin) {
      return task.id;
    }
  }
  return undefined;
}

async function stateFiles(board: Board): Promise<Map<string, BoardFile>> {
  const files = new Map<string, BoardFile>();
  await Promise.all(
    board.config.states.map(async (state) => {
      const file = await readBoardFile(path.join(board.dir, state.fileName));
      files.set(state.name, file ?? emptyBoard(state.name));
    }),
  );
  return files;
}

// Completed work may have been archived out of DONE.md, so "absent" has to look here too.
async function archiveFiles(board: Board): Promise<BoardFile[]> {
  const dir = path.join(board.dir, ARCHIVE_DIR);
  const entries = await readdir(dir).catch(() => []);
  const files = await Promise.all(
    entries
      .filter((entry) => entry.endsWith(".md"))
      .map((entry) => readBoardFile(path.join(dir, entry))),
  );
  return files.filter((file): file is BoardFile => file !== undefined);
}

async function archiveIds(board: Board): Promise<Set<string>> {
  const files = await archiveFiles(board);
  return new Set(files.flatMap((file) => [...file.ids]));
}

async function knownBoard(board: Board, files: Map<string, BoardFile>): Promise<KnownBoard> {
  const all = [...files.values(), ...(await archiveFiles(board))];
  return {
    tasks: all.flatMap((file) => file.tasks),
    ids: new Set(all.flatMap((file) => [...file.ids])),
  };
}

function fileFor(files: Map<string, BoardFile>, state: StateConfig): BoardFile {
  return files.get(state.name) ?? emptyBoard(state.name);
}

function today(): string {
  return nowIso().slice(0, 10);
}

function stamp(): string {
  return nowIso().slice(0, 16).replace("T", " ");
}

async function readConfig(configPath: string, external: boolean): Promise<BoardConfig> {
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

async function createBuiltInBoard(projectPath: ProjectPath): Promise<BoardLocation> {
  const location = locationAt(path.join(projectPath.dataDir, BOARD_DIR), "isotopy");
  await mkdir(location.dir, { recursive: true });
  if (await readText(location.configPath)) {
    return location;
  }
  const config: BoardConfig = {
    idPrefix: "TASK",
    nextId: 1,
    states: [
      { name: "Backlog", fileName: "BACKLOG.md" },
      { name: "Next", fileName: "NEXT.md" },
      { name: "In Progress", fileName: "IN_PROGRESS.md" },
      { name: "Done", fileName: "DONE.md" },
    ],
    insertPosition: "top",
  };
  await writeFile(location.configPath, `${JSON.stringify(config, null, 2)}\n`);
  await Promise.all(
    config.states.map((state) =>
      writeFile(path.join(location.dir, state.fileName), boardHeading(state.name), {
        flag: "wx",
      }).catch(() => undefined),
    ),
  );
  return location;
}

function fingerprint(milestoneId: string, featureId: string, taskId: string): string {
  return createHash("sha256")
    .update(`${milestoneId}:${featureId}:${taskId}`)
    .digest("hex")
    .slice(0, 16);
}

function backlogState(board: Board): StateConfig {
  return (
    board.config.states.find((state) => state.name.toLowerCase() === "backlog") ?? {
      name: "Backlog",
      fileName: "BACKLOG.md",
    }
  );
}

function allowedTags(board: Board, tags: string[]): string[] {
  const allowed = new Set(board.config.tags ?? []);
  return tags.filter((tag) => allowed.size === 0 || allowed.has(tag));
}

function milestoneTask(
  board: Board,
  id: string,
  draft: MilestoneTaskDraft,
  origin: string,
  milestone: Milestone,
  featureId: string,
): Task {
  return {
    id,
    title: draft.title,
    description: draft.description.trim(),
    priority: toBoardPriority(draft.priority),
    tags: allowedTags(board, draft.tags),
    assignee: draft.assignee,
    updatedAt: stamp(),
    attributes: {
      [SOURCE_ATTRIBUTE]: `milestone ${milestone.id} · feature ${featureId}`,
      [ORIGIN_ATTRIBUTE]: origin,
    },
  };
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

function followUpTask(
  board: Board,
  id: string,
  draft: FollowUpTaskDraft,
  origin: string,
  run: RunState,
): Task {
  const source = [
    run.milestoneId ? `milestone ${run.milestoneId}` : undefined,
    run.featureId ? `feature ${run.featureId}` : undefined,
    `run ${run.id}`,
    `finding ${draft.findingId}`,
  ]
    .filter((part): part is string => Boolean(part))
    .join(" · ");
  return {
    id,
    title: draft.title,
    description: draft.description.trim(),
    priority: toBoardPriority(draft.priority),
    tags: allowedTags(board, draft.tags),
    assignee: draft.assignee,
    updatedAt: stamp(),
    attributes: { [SOURCE_ATTRIBUTE]: source, [ORIGIN_ATTRIBUTE]: origin },
  };
}

function stateFor(board: Board, name: string): StateConfig | undefined {
  return board.config.states.find(
    (state) => state.name.toLowerCase() === name.toLowerCase(),
  );
}

// WORK_LOG.md is Isotopy's own file, not a task board: its headings carry a dash
// rather than a colon, so nothing in it parses as a task.
async function appendWorkLog(board: Board, runId: string, ids: string[]): Promise<void> {
  const target = path.join(board.dir, "WORK_LOG.md");
  const current = await readText(target);
  if (!current) return;
  const entries = ids.map((id) => renderWorkLogEntry(id, today(), runId)).join("\n");
  await writeFile(target, prependWorkLogEntries(current, entries));
}

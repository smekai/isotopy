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
import { parseTasks, serializeTask } from "@smekai/taskplanner";
import type { Task } from "@smekai/taskplanner";
import {
  lineEndingOf,
  normalizeLineEndings,
  withLineEnding,
} from "../domain/markdown/line-endings.ts";
import type { LineEnding } from "../domain/markdown/line-endings.ts";
import {
  boardHeading,
  insertTaskSection,
  renderBoardDigest,
  renderWorkLogEntry,
  takeTaskSection,
} from "../domain/markdown/task-board.ts";
import {
  nextTaskNumber,
  taskIdForMarker,
  taskIdsIn,
  toBoardPriority,
} from "../domain/rules/task-board.ts";
import { structuralText } from "../domain/markdown/format.ts";
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

const SECTION_SEPARATOR = "\n\n---\n";

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
      tasks: tasksIn(files.get(state.name)),
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
    const known = await knownTexts(board, files);
    const knownIds = taskIdsIn(known);
    const requestedIds = proposal.features.flatMap((feature) => feature.existingTaskIds);
    const missing = [...new Set(requestedIds)].filter((id) => !knownIds.has(id));
    if (missing.length > 0) {
      throw new Error(`Existing task IDs were not found: ${missing.join(", ")}`);
    }

    const backlog = backlogState(board);
    const backlogFile = fileFor(files, backlog);
    let next = nextTaskNumber(board.config.idPrefix, board.config.nextId, known);
    const featureTaskIds: Record<string, string[]> = {};

    for (const feature of proposal.features) {
      const ids = [...feature.existingTaskIds];
      for (const draft of feature.taskDrafts) {
        const sourceMarker = marker(fingerprint(milestone.id, feature.id, draft.id));
        let id = taskIdForMarker(known, sourceMarker);
        if (!id) {
          id = `${board.config.idPrefix}-${String(next).padStart(3, "0")}`;
          const task = milestoneTask(board, id, draft, sourceMarker, milestone, feature.id);
          backlogFile.text = insertTaskSection(
            backlogFile.text,
            sectionOf(task),
            board.config.insertPosition ?? "top",
          );
          known.push(sectionOf(task));
          next += 1;
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
    const known = await knownTexts(board, files);
    const backlog = backlogState(board);
    const backlogFile = fileFor(files, backlog);
    let next = nextTaskNumber(board.config.idPrefix, board.config.nextId, known);
    const created: CreatedTaskReference[] = [];

    for (const draft of tasks) {
      const sourceMarker = `<!-- ISOTOPY-FINDING:${findingFingerprint(run, draft.findingId)} -->`;
      if (taskIdForMarker(known, sourceMarker)) {
        continue;
      }
      const id = `${board.config.idPrefix}-${String(next).padStart(3, "0")}`;
      const task = followUpTask(board, id, draft, sourceMarker, run);
      backlogFile.text = insertTaskSection(
        backlogFile.text,
        sectionOf(task),
        board.config.insertPosition ?? "top",
      );
      known.push(sectionOf(task));
      created.push({ id, title: draft.title, backend: board.backend });
      next += 1;
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
    const destination =
      (await readBoardFile(targetPath)) ?? emptyBoardFile(targetStateName);
    const archived = taskIdsIn(await archiveTexts(board));
    const moved: string[] = [];

    for (const id of [...new Set(ids)]) {
      if (destination.text.includes(`## ${id}:`) || archived.has(id)) continue;
      const section = await this.takeSection(board, targetState, id);
      if (!section) continue;
      destination.text = insertTaskSection(destination.text, section, "top");
      moved.push(id);
    }
    if (moved.length === 0) return [];
    await writeBoardFile(targetPath, destination);
    if (targetStateName === "Done") {
      await appendWorkLog(board, runId, moved);
    }
    return moved;
  }

  private async takeSection(
    board: Board,
    targetState: StateConfig,
    id: string,
  ): Promise<string | undefined> {
    for (const state of board.config.states) {
      if (state.fileName === targetState.fileName) continue;
      const sourcePath = path.join(board.dir, state.fileName);
      const source = await readBoardFile(sourcePath);
      if (!source) continue;
      const taken = takeTaskSection(source.text, id);
      if (!taken.section) continue;
      await writeBoardFile(sourcePath, { ...source, text: taken.text });
      return taken.section;
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
  text: string;
  lineEnding: LineEnding;
}

function locationAt(dir: string, backend: BoardLocation["backend"]): BoardLocation {
  return { backend, dir, configPath: path.join(dir, "config.json") };
}

async function readText(filePath: string): Promise<string | undefined> {
  return readFile(filePath, "utf8").catch(() => undefined);
}

// The ending is remembered per file, because two state files in one repository can differ.
async function readBoardFile(filePath: string): Promise<BoardFile | undefined> {
  const raw = await readText(filePath);
  return raw === undefined
    ? undefined
    : { text: normalizeLineEndings(raw), lineEnding: lineEndingOf(raw) };
}

function writeBoardFile(filePath: string, file: BoardFile): Promise<void> {
  return writeFile(filePath, withLineEnding(file.text, file.lineEnding));
}

function emptyBoardFile(stateName: string): BoardFile {
  return { text: boardHeading(stateName), lineEnding: "\n" };
}

function tasksIn(file: BoardFile | undefined): Task[] {
  return file ? parseTasks(file.text).tasks : [];
}

async function stateFiles(board: Board): Promise<Map<string, BoardFile>> {
  const files = new Map<string, BoardFile>();
  await Promise.all(
    board.config.states.map(async (state) => {
      const file = await readBoardFile(path.join(board.dir, state.fileName));
      files.set(state.name, file ?? emptyBoardFile(state.name));
    }),
  );
  return files;
}

// Completed work may have been archived out of DONE.md, so "absent" has to look here too.
async function archiveTexts(board: Board): Promise<string[]> {
  const dir = path.join(board.dir, ARCHIVE_DIR);
  const entries = await readdir(dir).catch(() => []);
  const files = await Promise.all(
    entries
      .filter((entry) => entry.endsWith(".md"))
      .map((entry) => readBoardFile(path.join(dir, entry))),
  );
  return files.flatMap((file) => (file ? [file.text] : []));
}

async function knownTexts(board: Board, files: Map<string, BoardFile>): Promise<string[]> {
  return [...[...files.values()].map((file) => file.text), ...(await archiveTexts(board))];
}

function fileFor(files: Map<string, BoardFile>, state: StateConfig): BoardFile {
  return files.get(state.name) ?? emptyBoardFile(state.name);
}

function sectionOf(task: Task): string {
  return `${serializeTask(task)}${SECTION_SEPARATOR}`;
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

function marker(value: string): string {
  return `<!-- ISOTOPY-MILESTONE-TASK:${value} -->`;
}

function backlogState(board: Board): StateConfig {
  return (
    board.config.states.find((state) => state.name.toLowerCase() === "backlog") ?? {
      name: "Backlog",
      fileName: "BACKLOG.md",
    }
  );
}

// A draft is model output, and `serializeTask` writes these fields verbatim — so a
// newline in one would close the section and open a second task on the next line.
function oneLine(value: string): string {
  return structuralText(value);
}

function allowedTags(board: Board, tags: string[]): string[] {
  const allowed = new Set(board.config.tags ?? []);
  return tags.map(oneLine).filter((tag) => tag && (allowed.size === 0 || allowed.has(tag)));
}

function bodyWithSource(description: string, source: string, sourceMarker: string): string {
  return [description.trim(), "", `**Isotopy source:** ${source}`, sourceMarker].join("\n");
}

function milestoneTask(
  board: Board,
  id: string,
  draft: MilestoneTaskDraft,
  sourceMarker: string,
  milestone: Milestone,
  featureId: string,
): Task {
  return {
    id,
    title: oneLine(draft.title),
    description: bodyWithSource(
      draft.description,
      `milestone ${milestone.id} · feature ${featureId}`,
      sourceMarker,
    ),
    priority: toBoardPriority(draft.priority),
    tags: allowedTags(board, draft.tags),
    assignee: draft.assignee && oneLine(draft.assignee),
    updatedAt: stamp(),
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
  sourceMarker: string,
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
    title: oneLine(draft.title),
    description: bodyWithSource(draft.description, source, sourceMarker),
    priority: toBoardPriority(draft.priority),
    tags: allowedTags(board, draft.tags),
    assignee: draft.assignee && oneLine(draft.assignee),
    updatedAt: stamp(),
  };
}

function stateFor(board: Board, name: string): StateConfig | undefined {
  return board.config.states.find(
    (state) => state.name.toLowerCase() === name.toLowerCase(),
  );
}

async function appendWorkLog(board: Board, runId: string, ids: string[]): Promise<void> {
  const target = path.join(board.dir, "WORK_LOG.md");
  const current = await readBoardFile(target);
  if (!current) return;
  const entries = ids.map((id) => renderWorkLogEntry(id, today(), runId)).join("\n");
  await writeBoardFile(target, {
    ...current,
    text: insertTaskSection(current.text, entries, "top"),
  });
}

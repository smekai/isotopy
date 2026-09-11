import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import type {
  FollowUpTaskDraft,
  Milestone,
  MilestoneProposal,
  RunState,
} from "@isotopy/core";
import { TaskBoardAdapter } from "../src/services/task-board-adapter.ts";
import type { ProjectPath } from "../src/paths.ts";

let root: string;
let project: ProjectPath;

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "isotopy-task-board-"));
  project = { id: "p", root, dataDir: path.join(root, ".isotopy") };
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }).catch(
    () => undefined,
  );
});

test("a nextId bumped on disk between calls is honoured — board config is re-read every call, never cached", async () => {
  // Arrange — a TaskPlanner board, one call to settle the board location, then
  // an external edit of the kind a human or another agent makes mid-session.
  const adapter = new TaskBoardAdapter(project);
  await writeTaskPlannerBoard(1);
  await adapter.createFollowUpTasks(run(), [draft("f1")]);
  await writeTaskPlannerBoard(50);

  // Act
  const created = await adapter.createFollowUpTasks(run(), [draft("f2")]);

  // Assert
  expect(created.map((task) => task.id)).toEqual(["TASK-050"]);
});

test("a .tasks board appearing after the built-in one is already in use does not steal the run — the resolved location is kept", async () => {
  // Arrange — no board at all, so the first call creates the built-in one and
  // settles the location there. A .tasks board then appears; on a fresh probe
  // it would outrank the built-in board.
  const adapter = new TaskBoardAdapter(project);
  const first = await adapter.createFollowUpTasks(run(), [draft("f1")]);
  expect(first.map((task) => task.backend)).toEqual(["isotopy"]);
  await writeTaskPlannerBoard(1);

  // Act
  const created = await adapter.createFollowUpTasks(run(), [draft("f2")]);

  // Assert
  expect(created.map((task) => task.backend)).toEqual(["isotopy"]);
});

test("a board created after a lookup that found none is picked up — an absent board is not remembered as absent", async () => {
  // Arrange
  const adapter = new TaskBoardAdapter(project);
  expect(await adapter.boardDigest()).toBe("No existing task board is configured.");
  await writeTaskPlannerBoard(1);
  await seedBacklog("## TASK-007: Ship the thing\n");

  // Act
  const context = await adapter.boardDigest();

  // Assert
  expect(context).toContain("TASK-007: Ship the thing");
});

test("a bumped nextId is written back to the board config", async () => {
  // Arrange
  const adapter = new TaskBoardAdapter(project);
  await writeTaskPlannerBoard(7);

  // Act
  await adapter.createFollowUpTasks(run(), [draft("f1")]);

  // Assert
  const config = JSON.parse(
    await readFile(path.join(root, ".tasks", "config.json"), "utf8"),
  ) as { nextId: number; idPrefix: string };
  expect(config).toMatchObject({ idPrefix: "TASK", nextId: 8 });
});

// The parser TaskPlanner ships rebuilds a whole state file from the tasks it read,
// which drops anything it did not recognise. Isotopy edits the file around a task
// instead, so a board keeps the bytes its owner put there.
test("a comment above a task survives a write, because the file is edited and never rebuilt", async () => {
  // Arrange
  const adapter = new TaskBoardAdapter(project);
  await writeTaskPlannerBoard(1);
  await seedBacklog("<!-- keep this -->\n## TASK-004: Existing\n**Priority:** P1\n\n---\n");

  // Act
  await adapter.createFollowUpTasks(run(), [draft("f1")]);

  // Assert
  expect(await backlogText()).toContain("<!-- keep this -->");
});

test("a task whose prefix the shipped parser refuses is left where it is, not deleted", async () => {
  // Arrange — TaskPlanner's heading regex takes an uppercase prefix only.
  const adapter = new TaskBoardAdapter(project);
  await writeTaskPlannerBoard(1);
  await seedBacklog("## task-004: Lowercase\n**Priority:** P1\n\n---\n");

  // Act
  await adapter.createFollowUpTasks(run(), [draft("f1")]);

  // Assert
  expect(await backlogText()).toContain("## task-004: Lowercase");
});

// TaskPlanner's own ConfigManager rewrites the file it reads — reformatting it and
// injecting defaults, including states the project never declared.
test("reading a board leaves its config exactly as its owner wrote it", async () => {
  // Arrange
  const adapter = new TaskBoardAdapter(project);
  await writeTaskPlannerBoard(1);
  const before = await readFile(path.join(root, ".tasks", "config.json"), "utf8");

  // Act
  await adapter.boardDigest();

  // Assert
  expect(await readFile(path.join(root, ".tasks", "config.json"), "utf8")).toBe(before);
});

test("a task archived out of Done still counts as existing, so approval does not reject it", async () => {
  // Arrange
  const adapter = new TaskBoardAdapter(project);
  await writeTaskPlannerBoard(1);
  await mkdir(path.join(root, ".tasks", "archive"), { recursive: true });
  await writeFile(
    path.join(root, ".tasks", "archive", "DONE-2026.md"),
    "# Done\n\n## TASK-004: Archived\n**Priority:** P1\n\n---\n",
  );

  // Act
  const links = await adapter.approveMilestoneTasks(milestone(), proposal(["TASK-004"]));

  // Assert
  expect(links.featureTaskIds.f1).toContain("TASK-004");
});

// One directory name, so the board an agent reads through the MCP tool and the board
// Isotopy writes are always the same one. The tool searches for `.tasks/config.json`,
// so a board anywhere else would be readable by half the product.
test("the built-in board is created where the taskplanner tools also look for it", async () => {
  // Arrange — no board of any kind.
  // Act
  await new TaskBoardAdapter(project).createFollowUpTasks(run(), [draft("f1")]);

  // Assert
  expect(await readFile(path.join(project.dataDir, ".tasks", "config.json"), "utf8")).toContain(
    "TASK",
  );
});

test("a priority the shipped parser silently coerces never reaches disk, because nothing rewrites what it read", async () => {
  // Arrange — P9 is not a priority; the parser reads it back as P4 without warning.
  const adapter = new TaskBoardAdapter(project);
  await writeTaskPlannerBoard(1);
  await seedBacklog("## TASK-004: Existing\n**Priority:** P9\n\n---\n");

  // Act
  await adapter.createFollowUpTasks(run(), [draft("f1")]);

  // Assert
  expect(await backlogText()).toContain("**Priority:** P9");
});

function backlogText(): Promise<string> {
  return readFile(path.join(root, ".tasks", "BACKLOG.md"), "utf8");
}

function milestone(): Milestone {
  return {
    id: "m1",
    projectId: "p",
    name: "Milestone one",
    goal: "Ship it",
    status: "active",
    autoRunNext: false,
    features: [],
    planningRunIds: [],
    createdAt: "2026-08-07T00:00:00.000Z",
    updatedAt: "2026-08-07T00:00:00.000Z",
  };
}

function proposal(existingTaskIds: string[]): MilestoneProposal {
  return {
    createdAt: "2026-08-07T00:00:00.000Z",
    revision: 1,
    name: "Milestone one",
    goal: "Ship it",
    features: [
      {
        id: "f1",
        title: "A feature",
        description: "It does a thing",
        acceptanceCriteria: ["It works"],
        existingTaskIds,
        taskDrafts: [],
      },
    ],
  };
}

async function writeTaskPlannerBoard(nextId: number): Promise<void> {
  const dir = path.join(root, ".tasks");
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, "config.json"),
    JSON.stringify({
      version: 2,
      idPrefix: "TASK",
      nextId,
      states: [
        { name: "Backlog", fileName: "BACKLOG.md" },
        { name: "Done", fileName: "DONE.md" },
      ],
      insertPosition: "top",
    }),
  );
}

async function seedBacklog(content: string): Promise<void> {
  await writeFile(path.join(root, ".tasks", "BACKLOG.md"), `# Backlog\n\n${content}`);
}

function run(overrides: Partial<RunState> = {}): RunState {
  return {
    id: overrides.id ?? "run-1",
    number: overrides.number ?? 1,
    projectId: overrides.projectId ?? "p",
    pipelineId: overrides.pipelineId ?? "pm-dev-test",
    pipelineName: overrides.pipelineName ?? "Developer + Tester",
    status: overrides.status ?? "completed",
    stages: overrides.stages ?? [],
    messages: overrides.messages ?? [],
    createdAt: overrides.createdAt ?? "2026-08-07T00:00:00.000Z",
    ...overrides,
  };
}

function draft(findingId: string, overrides: Partial<FollowUpTaskDraft> = {}): FollowUpTaskDraft {
  return {
    findingId,
    title: overrides.title ?? `Follow up on ${findingId}`,
    description: overrides.description ?? "Something to do later.",
    priority: overrides.priority ?? "P2",
    tags: overrides.tags ?? [],
  };
}

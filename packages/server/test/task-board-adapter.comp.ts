import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import type { FollowUpTaskDraft, RunState } from "@isotopy/core";
import { TaskBoardAdapter } from "../src/services/task-board-adapter.ts";
import type { ProjectPath } from "../src/paths.ts";

let root: string;
let project: ProjectPath;

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "adhd-task-board-"));
  project = { id: "p", root, dataDir: path.join(root, ".adhd") };
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
  expect(await adapter.planningContext()).toBe("No existing task board is configured.");
  await writeTaskPlannerBoard(1);
  await seedBacklog("## TASK-007: Ship the thing\n");

  // Act
  const context = await adapter.planningContext();

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

// Reading and writing a board is TaskPlanner's, and its own suite covers it. What earns
// a test here is the seam: an Isotopy draft becomes a task on the project's own board and
// reads back through the adapter.
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import type { FollowUpTaskDraft, RunState } from "@isotopy/core";
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

test("a follow-up reaches the project's own board and reads back through the adapter", async () => {
  // Arrange — no board at all, so the run also proves Isotopy creates one where every
  // TaskPlanner client looks for it.
  const adapter = new TaskBoardAdapter(project);

  // Act
  const created = await adapter.createFollowUpTasks(run(), [draft("f1")]);

  // Assert
  expect(created).toEqual([{ id: "TASK-001", title: "Follow up on f1" }]);
  expect(await readFile(path.join(root, ".tasks", "BACKLOG.md"), "utf8")).toContain(
    "Follow up on f1",
  );
  expect(await adapter.tasksContext()).toContain("TASK-001");
});

function run(): RunState {
  return {
    id: "run-1",
    number: 1,
    projectId: "p",
    pipelineId: "pm-dev-test",
    pipelineName: "Developer + Tester",
    status: "completed",
    stages: [],
    messages: [],
    createdAt: "2026-08-07T00:00:00.000Z",
  };
}

function draft(findingId: string): FollowUpTaskDraft {
  return {
    findingId,
    title: `Follow up on ${findingId}`,
    description: "Something to do later.",
    priority: "P2",
    tags: [],
  };
}

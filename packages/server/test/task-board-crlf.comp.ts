// Measured against @smekai/taskplanner 2.3.0: the same board content parses to one
// task as LF and to **zero tasks with warnings** as CRLF. That is not a
// distinguishable failure — a CRLF board reads exactly like an empty one — and Git
// for Windows checks out CRLF by default, on the *user's* repository. One parser
// therefore means one parser plus a boundary that normalises in and restores out.
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import type { FollowUpTaskDraft, RunState } from "@isotopy/core";
import { TaskBoardAdapter } from "../src/services/task-board-adapter.ts";
import type { ProjectPath } from "../src/paths.ts";

const BACKLOG_BODY = [
  "# Backlog",
  "",
  "## TASK-004: Existing",
  "**Priority:** P1",
  "",
  "Description.",
  "",
  "---",
  "",
].join("\n");

let root: string;
let project: ProjectPath;

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "isotopy-board-crlf-"));
  project = { id: "p", root, dataDir: path.join(root, ".isotopy") };
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }).catch(
    () => undefined,
  );
});

test("a CRLF board reads back the tasks it holds, not the empty board a raw parse reports", async () => {
  // Arrange
  await writeBoard(crlf(BACKLOG_BODY));

  // Act
  const digest = await new TaskBoardAdapter(project).boardDigest();

  // Assert
  expect(digest).toContain("TASK-004: Existing");
});

test("an LF board reads the same, so the boundary is not a Windows-only path", async () => {
  // Arrange
  await writeBoard(BACKLOG_BODY);

  // Act
  const digest = await new TaskBoardAdapter(project).boardDigest();

  // Assert
  expect(digest).toContain("TASK-004: Existing");
});

test("writing into a CRLF board leaves every line ending as the file had it", async () => {
  // Arrange
  await writeBoard(crlf(BACKLOG_BODY));

  // Act
  await new TaskBoardAdapter(project).createFollowUpTasks(run(), [draft("f1")]);

  // Assert
  expect(await backlogText()).not.toMatch(/(?<!\r)\n/);
});

test("writing into an LF board does not convert it to CRLF on a Windows host", async () => {
  // Arrange
  await writeBoard(BACKLOG_BODY);

  // Act
  await new TaskBoardAdapter(project).createFollowUpTasks(run(), [draft("f1")]);

  // Assert
  expect(await backlogText()).not.toContain("\r\n");
});

test("a task written into a CRLF board reads back with the content it was given", async () => {
  // Arrange
  await writeBoard(crlf(BACKLOG_BODY));
  const adapter = new TaskBoardAdapter(project);

  // Act
  await adapter.createFollowUpTasks(run(), [draft("f1")]);

  // Assert
  expect(await adapter.boardDigest()).toContain("Follow up on f1");
});

function crlf(text: string): string {
  return text.replace(/\n/g, "\r\n");
}

function backlogText(): Promise<string> {
  return readFile(path.join(root, ".tasks", "BACKLOG.md"), "utf8");
}

async function writeBoard(backlog: string): Promise<void> {
  const dir = path.join(root, ".tasks");
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, "config.json"),
    JSON.stringify({
      idPrefix: "TASK",
      nextId: 10,
      states: [{ name: "Backlog", fileName: "BACKLOG.md" }],
      insertPosition: "top",
    }),
  );
  await writeFile(path.join(dir, "BACKLOG.md"), backlog);
}

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

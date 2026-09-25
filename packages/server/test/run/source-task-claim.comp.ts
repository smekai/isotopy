// A run with sourceTaskIds claims those tasks on the board before work starts,
// and releases them when the run does not finish — so an unattended episode cannot
// pick the same Next task twice, and an abort does not leave it stuck forever.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import {
  addTestProject,
  createTestApp,
  post,
  put,
  startRun,
  waitForRunStatus,
  waitForStageStatus,
} from "../support/harness.ts";
import type { TestApp } from "../support/harness.ts";

const TASK_BODY = [
  "# Next",
  "",
  "## TASK-001: Source work",
  "**Priority:** P1",
  "",
  "Something to claim.",
  "",
  "---",
  "",
].join("\n");

const BOARD_CONFIG = {
  idPrefix: "TASK",
  nextId: 2,
  states: [
    { name: "Backlog", fileName: "BACKLOG.md" },
    { name: "Next", fileName: "NEXT.md" },
    { name: "In Progress", fileName: "IN_PROGRESS.md" },
    { name: "Done", fileName: "DONE.md" },
  ],
  insertPosition: "top",
};

let ctx: TestApp;
let projectRoot: string;
let headers: Record<string, string>;

beforeEach(async () => {
  ctx = await createTestApp();
  const project = await addTestProject(ctx.registry, "source-claim");
  projectRoot = project.root;
  headers = project.headers;
  await writeBoard(projectRoot);
});

afterEach(async () => {
  await ctx.dispose();
});

test("a run with sourceTaskIds and gates off moves its task to In Progress at start", async () => {
  // Arrange
  await put(ctx.app, "/settings/preferences", { gates: { "pm-dev-test:intake": false } }, headers);
  anticipatePipeline();

  // Act
  const run = await startRun(
    ctx.app,
    {
      pipelineId: "pm-dev-test",
      task: "Source work",
      engine: "claude-code",
      sourceTaskIds: ["TASK-001"],
    },
    headers,
  );

  // Assert — claimed before any gate; gates are off so approveGate never runs.
  expect(await boardFile(projectRoot, "IN_PROGRESS.md")).toContain("TASK-001");
  expect(await boardFile(projectRoot, "NEXT.md")).not.toContain("TASK-001");
  await waitForRunStatus(ctx.app, run.id, "completed");
});

test("aborting a claimed run returns its source task to Next", async () => {
  // Arrange
  await put(ctx.app, "/settings/preferences", { gates: { "pm-dev-test:intake": false } }, headers);
  ctx.engine.anticipate({ as: "Project Manager" }).hangsUntilAborted();
  const run = await startRun(
    ctx.app,
    {
      pipelineId: "pm-dev-test",
      task: "Source work",
      engine: "claude-code",
      sourceTaskIds: ["TASK-001"],
    },
    headers,
  );
  expect(await boardFile(projectRoot, "IN_PROGRESS.md")).toContain("TASK-001");
  await ctx.engine.waitForCall(1);

  // Act
  await post(ctx.app, `/runs/${run.id}/abort`, {}, headers);
  await waitForRunStatus(ctx.app, run.id, "cancelled");
  await waitForBoard(projectRoot, "NEXT.md", "TASK-001");

  // Assert
  expect(await boardFile(projectRoot, "IN_PROGRESS.md")).not.toContain("TASK-001");
});

test("restarting an aborted run claims the source task its abort released", async () => {
  // Arrange — the abort put TASK-001 back in Next
  await put(ctx.app, "/settings/preferences", { gates: { "pm-dev-test:intake": false } }, headers);
  ctx.engine.anticipate({ as: "Project Manager" }).hangsUntilAborted();
  const run = await startRun(
    ctx.app,
    {
      pipelineId: "pm-dev-test",
      task: "Source work",
      engine: "claude-code",
      sourceTaskIds: ["TASK-001"],
    },
    headers,
  );
  await ctx.engine.waitForCall(1);
  await post(ctx.app, `/runs/${run.id}/abort`, {}, headers);
  await waitForRunStatus(ctx.app, run.id, "cancelled");
  await waitForBoard(projectRoot, "NEXT.md", "TASK-001");

  // Anticipate
  ctx.engine.anticipate({ as: "Project Manager" }).hangsUntilAborted();

  // Act
  await post(ctx.app, `/runs/${run.id}/restart`, { stageId: "intake" }, headers);

  // Assert
  expect(await boardFile(projectRoot, "IN_PROGRESS.md")).toContain("TASK-001");
  expect(await boardFile(projectRoot, "NEXT.md")).not.toContain("TASK-001");
});

test("a gated run still claims at start, before the intake gate is approved", async () => {
  // Arrange — default gates leave intake parked
  ctx.engine.anticipate({ as: "Project Manager" }).reports("Intake done.");

  // Act
  const run = await startRun(
    ctx.app,
    {
      pipelineId: "pm-dev-test",
      task: "Source work",
      engine: "claude-code",
      sourceTaskIds: ["TASK-001"],
    },
    headers,
  );
  await waitForStageStatus(ctx.app, run.id, "intake", "awaiting");

  // Assert — claimed without approving the gate
  expect(await boardFile(projectRoot, "IN_PROGRESS.md")).toContain("TASK-001");
  expect(await boardFile(projectRoot, "NEXT.md")).not.toContain("TASK-001");
});

function anticipatePipeline(): void {
  ctx.engine.anticipate({ as: "Project Manager" }).reports("Intake done.");
  ctx.engine.anticipate({ as: "Developer" }).reports("Implemented.\nMARKER-DEVELOPER");
  ctx.engine.anticipate({ as: "Tester" }).reports("Verified.\n\nVERDICT: PASS");
  ctx.engine.anticipateRunReview();
}

async function writeBoard(root: string): Promise<void> {
  const tasksDir = path.join(root, ".tasks");
  await mkdir(tasksDir, { recursive: true });
  await writeFile(path.join(tasksDir, "config.json"), `${JSON.stringify(BOARD_CONFIG, null, 2)}\n`);
  await writeFile(path.join(tasksDir, "BACKLOG.md"), "# Backlog\n");
  await writeFile(path.join(tasksDir, "NEXT.md"), TASK_BODY);
  await writeFile(path.join(tasksDir, "IN_PROGRESS.md"), "# In Progress\n");
  await writeFile(path.join(tasksDir, "DONE.md"), "# Done\n");
}

function boardFile(root: string, name: string): Promise<string> {
  return readFile(path.join(root, ".tasks", name), "utf8");
}

async function waitForBoard(root: string, name: string, needle: string): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if ((await boardFile(root, name)).includes(needle)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  expect(await boardFile(root, name)).toContain(needle);
}

import { afterEach, beforeEach, expect, test } from "vitest";
import type { RunState } from "@isotopy/core";
import {
  createTestApp,
  get,
  post,
  stageOf,
  startRun,
  waitForRunStatus,
  waitForStageStatus,
} from "../support/harness.ts";
import type { TestApp } from "../support/harness.ts";

const TASK = "add a greet function";
const PM_REPORT = "Build a greet function. Done when it prints a greeting.";
const DEV_REPORT = "Implemented it. MARKER-DEVELOPER";
const TESTER_REPORT = "Verified it.\n\nVERDICT: PASS";

let ctx: TestApp;

beforeEach(async () => {
  ctx = await createTestApp();
});

afterEach(async () => {
  await ctx.dispose();
});

test("a gate holds the run at awaiting until it is approved", async () => {
  // Arrange
  const { app, engine } = ctx;
  engine.anticipate({ as: "Project Manager" }).reports(PM_REPORT);
  engine.anticipate({ as: "Developer" }).reports(DEV_REPORT);
  engine.anticipate({ as: "Tester" }).reports(TESTER_REPORT);
  engine.anticipateRunReview();

  // Act
  const run = await startRun(app, {
    pipelineId: "pm-dev-test",
    task: TASK,
    engine: "claude-code",
  });
  const waiting = await waitForStageStatus(app, run.id, "intake", "awaiting");
  expect(waiting.status).toBe("awaiting");
  const { status } = await post(app, `/runs/${run.id}/gates/intake/approve`);

  // Assert
  expect(status).toBe(200);
  const finished = await waitForRunStatus(app, run.id, "completed");
  expect(stageOf(finished, "implementation").status).toBe("passed");
  expect(stageOf(finished, "test").status).toBe("passed");
  engine.verify();
});

test("approving a gate that is not awaiting is a conflict", async () => {
  // Arrange
  const { app, engine } = ctx;
  engine.anticipate({ as: "Agent" }).reports(DEV_REPORT);
  const run = await startRun(app, { pipelineId: "solo", task: TASK, engine: "claude-code" });
  await waitForRunStatus(app, run.id, "completed");

  // Act — the stage exists but has long since passed
  const { status, body } = await post<{ error: string }>(
    app,
    `/runs/${run.id}/gates/solo/approve`,
  );

  // Assert
  expect(status).toBe(409);
  expect(body.error).toMatch(/not awaiting approval/);
});

test("restarting a run that is still going is a conflict", async () => {
  // Arrange
  const { app, engine } = ctx;
  engine.anticipate({ as: "Developer" }).hangsUntilAborted();
  const run = await startRun(app, { pipelineId: "solo", task: TASK, engine: "claude-code" });
  await engine.waitForCall(1);

  // Act
  const { status, body } = await post<{ error: string }>(
    app,
    `/runs/${run.id}/restart`,
    { stageId: "implementation" },
  );

  // Assert
  expect(status).toBe(409);
  expect(body.error).toMatch(
    /only be restarted after needing attention, failing, or being aborted/,
  );
});

test("restart without a stageId is rejected", async () => {
  // Arrange
  const { app, engine } = ctx;
  engine.anticipate({ as: "Developer" }).hangsUntilAborted();
  const run = await startRun(app, { pipelineId: "solo", task: TASK, engine: "claude-code" });
  await engine.waitForCall(1);

  // Act
  const { status, body } = await post<{ error: string }>(app, `/runs/${run.id}/restart`, {});

  // Assert
  expect(status).toBe(400);
  expect(body.error).toBe("Invalid request");
});

test("runs are listed newest first", async () => {
  // Arrange — one active run per project, so the two runs are serialised.
  const { app, engine } = ctx;
  engine.anticipate({ as: "Dev 1" }).reports(DEV_REPORT);
  engine.anticipate({ as: "Test 1" }).reports(TESTER_REPORT);
  engine.anticipate({ as: "Dev 2" }).reports(DEV_REPORT);
  engine.anticipate({ as: "Test 2" }).reports(TESTER_REPORT);
  const first = await startRun(app, { pipelineId: "solo", task: "comp older", engine: "claude-code" });
  await waitForRunStatus(app, first.id, "completed");
  const second = await startRun(app, { pipelineId: "solo", task: "comp newer", engine: "claude-code" });
  await waitForRunStatus(app, second.id, "completed");

  // Act
  const { status, body } = await get<RunState[]>(app, "/runs");

  // Assert
  expect(status).toBe(200);
  expect(body.map((run) => run.task)).toEqual(["comp newer", "comp older"]);
  expect(body.map((run) => run.number)).toEqual([2, 1]);
});

test("an unknown pipeline is rejected before a run is created", async () => {
  // Arrange
  const { app } = ctx;

  // Act
  const { status, body } = await post<{ error: string }>(app, "/runs", {
    pipelineId: "not-a-pipeline",
    task: "comp unknown",
  });

  // Assert
  expect(status).toBe(400);
  expect(body.error).toBe("Unknown pipeline: not-a-pipeline");
  const { body: runs } = await get<RunState[]>(app, "/runs");
  expect(runs).toHaveLength(0);
});

test("an unknown run id is a 404", async () => {
  // Arrange
  const { app } = ctx;

  // Act
  const { status, body } = await get<{ error: string }>(app, "/runs/nope");

  // Assert
  expect(status).toBe(404);
  expect(body.error).toBe("Run not found");
});

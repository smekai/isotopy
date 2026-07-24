// Run lifecycle, proven at the API boundary against the simulated pipeline.
//
// `sequential` carries no personas, so the orchestrator never reaches an engine
// adapter — which makes the empty `engine.verify()` in these tests a real
// assertion: the simulated path must not spawn anything.
import { afterEach, beforeEach, expect, test } from "vitest";
import type { RunState } from "@adhd/core";
import {
  FAST_SIM,
  createTestApp,
  get,
  post,
  stageOf,
  startRun,
  waitForRunStatus,
  waitForStageStatus,
} from "./support/harness.ts";
import type { TestApp } from "./support/harness.ts";

/** Every `sequential` stage; gates sit after requirements, design and release. */
const ALL_STAGES = [
  "intake",
  "requirements",
  "design",
  "implementation",
  "review",
  "test",
  "release",
  "deploy",
];

const disableAllExcept = (enabled: string[]) =>
  ALL_STAGES.filter((id) => !enabled.includes(id));

let ctx: TestApp;

beforeEach(async () => {
  ctx = await createTestApp();
});

afterEach(async () => {
  await ctx.dispose();
});

test("a run completes with enabled stages passed and disabled stages skipped", async () => {
  // Arrange
  const { app, engine } = ctx;

  // Anticipate — no engine calls at all: this pipeline is simulated.

  // Act
  const run = await startRun(app, {
    pipelineId: "sequential",
    task: "comp lifecycle",
    disabledStages: disableAllExcept(["intake", "implementation"]),
    ...FAST_SIM,
  });

  // Assert
  const finished = await waitForRunStatus(app, run.id, "completed");
  expect(stageOf(finished, "intake").status).toBe("passed");
  expect(stageOf(finished, "implementation").status).toBe("passed");
  expect(stageOf(finished, "deploy").status).toBe("skipped");
  expect(finished.completedAt).toBeDefined();
  engine.verify();
});

test("aborting a running run cancels it and skips the unfinished stages", async () => {
  // Arrange
  const { app, engine } = ctx;
  const run = await startRun(app, {
    pipelineId: "sequential",
    task: "comp abort",
    disabledStages: disableAllExcept(["intake", "implementation", "test"]),
    ...FAST_SIM,
  });
  await waitForStageStatus(app, run.id, "intake", "running");

  // Act
  const { status, body } = await post<RunState>(app, `/runs/${run.id}/abort`);

  // Assert
  expect(status).toBe(200);
  expect(body.status).toBe("cancelled");
  const cancelled = await waitForRunStatus(app, run.id, "cancelled");
  expect(stageOf(cancelled, "test").status).toBe("skipped");
  engine.verify();
});

test("a gate holds the run at awaiting until it is approved", async () => {
  // Arrange
  const { app } = ctx;
  const run = await startRun(app, {
    pipelineId: "sequential",
    task: "comp gate",
    disabledStages: disableAllExcept(["intake", "requirements"]),
    ...FAST_SIM,
  });
  const waiting = await waitForRunStatus(app, run.id, "awaiting");
  expect(stageOf(waiting, "requirements").status).toBe("awaiting");

  // Act
  const { status } = await post(app, `/runs/${run.id}/gates/requirements/approve`);

  // Assert
  expect(status).toBe(200);
  const finished = await waitForRunStatus(app, run.id, "completed");
  expect(stageOf(finished, "requirements").status).toBe("passed");
});

test("approving a gate that is not awaiting is a conflict", async () => {
  // Arrange
  const { app } = ctx;
  const run = await startRun(app, {
    pipelineId: "sequential",
    task: "comp gate conflict",
    disabledStages: disableAllExcept(["intake"]),
    ...FAST_SIM,
  });
  await waitForRunStatus(app, run.id, "completed");

  // Act
  const { status, body } = await post<{ error: string }>(
    app,
    `/runs/${run.id}/gates/intake/approve`,
  );

  // Assert
  expect(status).toBe(409);
  expect(body.error).toMatch(/not awaiting approval/);
});

test("a cancelled run restarts from the stage the abort interrupted", async () => {
  // Arrange
  const { app } = ctx;
  const run = await startRun(app, {
    pipelineId: "sequential",
    task: "comp restart",
    disabledStages: disableAllExcept(["intake", "implementation", "test"]),
    ...FAST_SIM,
  });
  await waitForStageStatus(app, run.id, "intake", "running");
  await post(app, `/runs/${run.id}/abort`);
  await waitForRunStatus(app, run.id, "cancelled");

  // Act
  const { status } = await post(app, `/runs/${run.id}/restart`, { stageId: "intake" });

  // Assert
  expect(status).toBe(200);
  const finished = await waitForRunStatus(app, run.id, "completed");
  expect(stageOf(finished, "test").status).toBe("passed");
});

test("restarting a run that is still going is a conflict", async () => {
  // Arrange
  const { app } = ctx;
  const run = await startRun(app, {
    pipelineId: "sequential",
    task: "comp restart conflict",
    disabledStages: disableAllExcept(["intake", "implementation"]),
    ...FAST_SIM,
  });
  await waitForStageStatus(app, run.id, "intake", "running");

  // Act
  const { status, body } = await post<{ error: string }>(
    app,
    `/runs/${run.id}/restart`,
    { stageId: "intake" },
  );

  // Assert
  expect(status).toBe(409);
  expect(body.error).toMatch(/only be restarted after failing or being aborted/);
});

test("restart without a stageId is rejected", async () => {
  // Arrange
  const { app } = ctx;
  const run = await startRun(app, {
    pipelineId: "sequential",
    task: "comp restart validation",
    disabledStages: disableAllExcept(["intake"]),
    ...FAST_SIM,
  });
  await waitForRunStatus(app, run.id, "completed");

  // Act
  const { status, body } = await post<{ error: string }>(app, `/runs/${run.id}/restart`, {});

  // Assert
  expect(status).toBe(400);
  expect(body.error).toBe("stageId is required");
});

test("runs are listed newest first", async () => {
  // Arrange
  const { app } = ctx;
  const first = await startRun(app, {
    pipelineId: "sequential",
    task: "comp older",
    disabledStages: disableAllExcept(["intake"]),
    ...FAST_SIM,
  });
  await waitForRunStatus(app, first.id, "completed");
  const second = await startRun(app, {
    pipelineId: "sequential",
    task: "comp newer",
    disabledStages: disableAllExcept(["intake"]),
    ...FAST_SIM,
  });
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

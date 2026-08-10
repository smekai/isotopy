// Until TASK-124 the run store collapsed anything that was not "acceptEdits"
// down to "skip", so a third tier could be chosen in the UI, survive the route,
// and still reach the adapter as the default. The engine anticipation is the
// only place that catches it.
import { afterEach, beforeEach, expect, test } from "vitest";
import {
  addTestProject,
  createTestApp,
  post,
  startRun,
  waitForRunStatus,
} from "../support/harness.ts";
import type { TestApp } from "../support/harness.ts";

const TASK = "add a greet function";

let ctx: TestApp;

beforeEach(async () => {
  ctx = await createTestApp();
});

afterEach(async () => {
  await ctx.dispose();
});

test("a run started on the auto-review tier reaches the engine on that tier", async () => {
  // Arrange
  const project = await addTestProject(ctx.registry, "permission-auto-review");

  // Anticipate
  ctx.engine.anticipate({ as: "Agent", permissionMode: "autoReview" }).reports("Done.");
  ctx.engine.anticipateRunReview();

  // Act
  const run = await startRun(
    ctx.app,
    { pipelineId: "solo", task: TASK, engine: "claude-code", permissionMode: "autoReview" },
    project.headers,
  );

  // Assert
  await waitForRunStatus(ctx.app, run.id, "completed");
  ctx.engine.verify();
});

test("a permission mode no engine knows is refused rather than quietly downgraded", async () => {
  // Arrange
  const project = await addTestProject(ctx.registry, "permission-unknown");

  // Anticipate — none: a refused run must not reach an engine.

  // Act
  const { status } = await post(
    ctx.app,
    "/runs",
    { pipelineId: "solo", task: TASK, engine: "claude-code", permissionMode: "yolo" },
    project.headers,
  );

  // Assert
  expect(status).toBe(400);
  ctx.engine.verify();
});

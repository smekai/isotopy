import { afterEach, beforeEach, expect, test } from "vitest";
import {
  addTestProject,
  createTestApp,
  post,
  startRun,
  waitForRunStatus,
  waitForStageStatus,
} from "../support/harness.ts";
import type { TestApp } from "../support/harness.ts";

const TASK = "add a greet function";
const DEV_REPORT = "Implemented it.";

// The verbatim failure from TASK-211's Orchestrator turn.
const EXPIRED_SESSION = "Failed to authenticate: OAuth session expired and could not be refreshed";

let ctx: TestApp;

beforeEach(async () => {
  ctx = await createTestApp();
});

afterEach(async () => {
  await ctx.dispose();
});

test("an expired sign-in parks the stage on its owner as a sign-in, instead of failing the run", async () => {
  // Arrange
  const project = await addTestProject(ctx.registry, "sign-in-park");

  // Anticipate
  ctx.engine.anticipate({ as: "Agent" }).hitsLimit(EXPIRED_SESSION);

  // Act
  const run = await startRun(
    ctx.app,
    { pipelineId: "solo", task: TASK, engine: "claude-code" },
    project.headers,
  );

  // Assert
  const blocked = await waitForStageStatus(ctx.app, run.id, "solo", "blocked");
  expect(blocked.status).toBe("blocked");
  expect(blocked.limit).toMatchObject({ cause: "signed-out", raw: EXPIRED_SESSION, engine: "claude-code" });
  ctx.engine.verify();
});

test("Retry now after signing back in resumes the parked stage and the run completes", async () => {
  // Arrange
  const project = await addTestProject(ctx.registry, "sign-in-retry");
  ctx.engine.anticipate({ as: "Agent, signed out" }).hitsLimit(EXPIRED_SESSION);
  ctx.engine.anticipate({ as: "Agent, signed back in" }).reports(DEV_REPORT);
  ctx.engine.anticipateRunReview();
  const run = await startRun(
    ctx.app,
    { pipelineId: "solo", task: TASK, engine: "claude-code" },
    project.headers,
  );
  await waitForStageStatus(ctx.app, run.id, "solo", "blocked");

  // Act
  const resumed = await post(
    ctx.app,
    `/runs/${run.id}/limit/solo/resolve`,
    { choice: "retry-now" },
    project.headers,
  );

  // Assert
  expect(resumed.status).toBe(200);
  const finished = await waitForRunStatus(ctx.app, run.id, "completed");
  expect(finished.limit).toBeUndefined();
  ctx.engine.verify();
});

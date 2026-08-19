// A gate is a project's decision, not a property of the shipped pipeline. The
// Setup screen has always listed gates and never been able to change one, so the
// rule proven here is that what the screen stores is what the run does — a gate
// turned off does not park, and a gate added after a stage that shipped without
// one does.
import { afterEach, beforeEach, expect, test } from "vitest";
import type { RunState } from "@isotopy/core";
import {
  createTestApp,
  get,
  put,
  restartApp,
  stageOf,
  startRun,
  waitForRunStatus,
  waitForStageStatus,
} from "../support/harness.ts";
import type { TestApp } from "../support/harness.ts";

const TASK = "add a greet function";
const PIPELINE = { pipelineId: "pm-dev-test", task: TASK, engine: "claude-code" };

let ctx: TestApp;

beforeEach(async () => {
  ctx = await createTestApp();
});

afterEach(async () => {
  await ctx.dispose();
});

test("a gate the project turned off does not park the run", async () => {
  // Arrange
  await put(ctx.app, "/settings/preferences", { gates: { "pm-dev-test:intake": false } });

  // Anticipate
  anticipateWholePipeline();

  // Act
  const run = await startRun(ctx.app, PIPELINE);

  // Assert — no approval is posted, so a live gate would hold this forever.
  const finished = await waitForRunStatus(ctx.app, run.id, "completed");
  expect(stageOf(finished, "intake").status).toBe("passed");
});

test("a gate the project added parks a stage that ships without one", async () => {
  // Arrange
  await put(ctx.app, "/settings/preferences", {
    gates: { "pm-dev-test:intake": false, "pm-dev-test:implementation": true },
  });

  // Anticipate
  anticipateWholePipeline();

  // Act
  const run = await startRun(ctx.app, PIPELINE);

  // Assert
  const waiting = await waitForStageStatus(ctx.app, run.id, "implementation", "awaiting");
  expect(waiting.status).toBe("awaiting");
});

test("a run keeps the gates it started with, even after the project changes its mind", async () => {
  // Arrange
  await put(ctx.app, "/settings/preferences", { gates: { "pm-dev-test:intake": false } });
  anticipateWholePipeline();
  const run = await startRun(ctx.app, PIPELINE);
  const finished = await waitForRunStatus(ctx.app, run.id, "completed");
  await put(ctx.app, "/settings/preferences", { gates: { "pm-dev-test:intake": true } });
  await ctx.orchestrator.shutdown();

  // Act
  const restarted = await restartApp();

  // Assert — the run records what it did, not what the project would do now.
  const reloaded = await runFrom(restarted, finished.id);
  expect(stageOf(reloaded, "intake").status).toBe("passed");
  expect(reloaded.pipeline?.groups[0]?.stages[0]).toMatchObject({ gateAfter: false });
  await restarted.shutdown();
}, 15_000);

function anticipateWholePipeline(): void {
  ctx.engine.anticipate({ as: "Project Manager" }).reports("Scoped it.");
  ctx.engine.anticipate({ as: "Developer" }).reports("Built it.");
  ctx.engine.anticipate({ as: "Tester" }).reports("Checked it.\n\nVERDICT: PASS");
  ctx.engine.anticipateRunReview();
}

async function runFrom(
  restarted: Awaited<ReturnType<typeof restartApp>>,
  runId: string,
): Promise<RunState> {
  const { body } = await get<RunState>(restarted.app, `/runs/${runId}`);
  return body;
}

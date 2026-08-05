// What survives a restart. The orchestrator's read model is in-memory, so
// everything a user sees after the server comes back has to have been
// reconstructed from the project's run repository (a SQLite DB under .adhd/) —
// this suite is what proves that round trip.
import { afterEach, beforeEach, expect, test } from "vitest";
import { HOME_PROJECT_ID } from "@adhd/core";
import type { RunState } from "@adhd/core";
import { RunRepository } from "../../src/repository/run-repository.ts";
import {
  approveIntake,
  createTestApp,
  get,
  restartApp,
  stageOf,
  startRun,
  waitForRunStatus,
} from "../support/harness.ts";
import type { TestApp } from "../support/harness.ts";

let ctx: TestApp;

beforeEach(async () => {
  ctx = await createTestApp();
});

afterEach(async () => {
  await ctx.dispose();
});


test("runs are restored when the server comes back", async () => {
  // Arrange
  const { app } = ctx;

  // Anticipate
  ctx.engine.anticipate().reports("done");

  const run = await startRun(app, {
    pipelineId: "solo",
    task: "comp survives restart",
    engine: "claude-code",
  });
  await waitForRunStatus(app, run.id, "completed");
  await ctx.orchestrator.shutdown();

  // Act
  const restarted = await restartApp();

  // Assert
  const { body } = await get<RunState[]>(restarted.app, "/runs");
  expect(body).toHaveLength(1);
  const [restoredRun] = body;
  expect(restoredRun?.id).toBe(run.id);
  expect(restoredRun?.task).toBe("comp survives restart");
  expect(restoredRun?.status).toBe("completed");
  await restarted.shutdown();
});

test("a needs-attention run remains terminal when the server comes back", async () => {
  // Arrange
  const { app } = ctx;

  // Anticipate — the QA Engineer exits cleanly but reports a blocking verdict.
  ctx.engine.anticipate().reports("Scope approved.");
  ctx.engine.anticipate().reports("Implemented.");
  ctx.engine.anticipate().reports("Required behaviour is broken.\n\nVERDICT: FAIL");

  const run = await startRun(app, {
    pipelineId: "pm-dev-test",
    task: "persist a blocking verdict",
    engine: "claude-code",
  });
  await approveIntake(app, run.id);
  await waitForRunStatus(app, run.id, "needs_attention");
  await ctx.orchestrator.shutdown();

  // Act
  const restarted = await restartApp();

  // Assert
  const { body } = await get<RunState>(restarted.app, `/runs/${run.id}`);
  expect(body.status).toBe("needs_attention");
  expect(stageOf(body, "test").status).toBe("failed");
  expect(stageOf(body, "test").verdict).toBe("FAIL");
  await restarted.shutdown();
});

test("a run left mid-flight by a crash with no durable run is reconciled to failed", async () => {
  // Arrange — a run frozen mid-flight, as a killed process would have left it.
  const { home } = ctx;
  const runId = "crashed1";
  await seedHomeRun(home, {
    id: runId,
    number: 7,
    projectId: HOME_PROJECT_ID,
    pipelineId: "dev-test",
    pipelineName: "Developer + Tester",
    status: "running",
    task: "comp interrupted",
    stages: [
      { id: "implementation", label: "Developer", status: "passed", logs: [] },
      { id: "test", label: "Tester", status: "running", logs: [] },
    ],
    messages: [],
    createdAt: new Date().toISOString(),
  });

  // Anticipate — none: reconciliation is bookkeeping and must never spawn an engine.

  // Act
  const restarted = await restartApp();

  // Assert
  const { body } = await get<RunState>(restarted.app, `/runs/${runId}`);
  expect(body.status).toBe("failed");
  expect(stageOf(body, "test").status).toBe("failed");
  expect(stageOf(body, "test").logs.at(-1)?.message).toMatch(/Interrupted by server restart/);
  expect(stageOf(body, "implementation").status).toBe("passed");
  ctx.engine.verify();
  await restarted.shutdown();
});

test("run numbering continues from the highest number on disk", async () => {
  // Arrange — one completed run on disk, then a fresh process over the same home.
  const { app } = ctx;

  // Anticipate — one call per run; the queue outlives the restart.
  ctx.engine.anticipate().reports("done");
  ctx.engine.anticipate().reports("done");

  const first = await startRun(app, {
    pipelineId: "solo",
    task: "comp numbering",
    engine: "claude-code",
  });
  await waitForRunStatus(app, first.id, "completed");
  expect(first.number).toBe(1);
  await ctx.orchestrator.shutdown();
  const restarted = await restartApp();

  // Act
  const second = await startRun(restarted.app, {
    pipelineId: "solo",
    task: "comp numbering after restart",
    engine: "claude-code",
  });

  // Assert
  expect(second.number).toBe(2);
  await waitForRunStatus(restarted.app, second.id, "completed");
  ctx.engine.verify();
  await restarted.shutdown();
});

/**
 * Seed a run straight into the home project's DB, the way a crashed process
 * would have left it — used to drive the crash-recovery path on restart.
 */
async function seedHomeRun(home: string, run: RunState): Promise<void> {
  const repository = new RunRepository({ id: HOME_PROJECT_ID, root: home, dataDir: home });
  await repository.writeState(run.id, { version: 1, run });
  await repository.settle();
}

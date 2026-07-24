// What survives a restart. The orchestrator is in-memory, so everything a user
// sees after the server comes back has to have been reconstructed from the
// project's run repository (a SQLite DB under .adhd/) — this suite is what proves
// that round trip.
import { afterEach, beforeEach, expect, test } from "vitest";
import { HOME_PROJECT_ID } from "@adhd/core";
import type { RunState } from "@adhd/core";
import { RunRepository } from "../src/repository/run-repository.ts";
import {
  FAST_SIM,
  createTestApp,
  get,
  restartApp,
  stageOf,
  startRun,
  waitForRunStatus,
} from "./support/harness.ts";
import type { TestApp } from "./support/harness.ts";

let ctx: TestApp;

beforeEach(async () => {
  ctx = await createTestApp();
});

afterEach(async () => {
  await ctx.dispose();
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

test("runs are restored when the server comes back", async () => {
  const { app } = ctx;
  const run = await startRun(app, {
    pipelineId: "sequential",
    task: "comp survives restart",
    disabledStages: ["requirements", "design", "review", "test", "release", "deploy"],
    ...FAST_SIM,
  });
  await waitForRunStatus(app, run.id, "completed");
  await ctx.orchestrator.shutdown();

  const restarted = await restartApp();

  const { body } = await get<RunState[]>(restarted.app, "/runs");
  expect(body).toHaveLength(1);
  const [restoredRun] = body;
  expect(restoredRun?.id).toBe(run.id);
  expect(restoredRun?.task).toBe("comp survives restart");
  expect(restoredRun?.status).toBe("completed");
  await restarted.orchestrator.shutdown();
});

test("a run left mid-flight by a crash is reconciled to failed, not left running", async () => {
  const { home } = ctx;
  const runId = "crashed1";
  await seedHomeRun(home, {
    id: runId,
    number: 7,
    projectId: HOME_PROJECT_ID,
    pipelineId: "sequential",
    pipelineName: "Sequential lifecycle",
    status: "running",
    task: "comp interrupted",
    stages: [
      { id: "intake", label: "Intake", status: "passed", logs: [] },
      { id: "requirements", label: "Requirements", status: "running", logs: [] },
    ],
    createdAt: new Date().toISOString(),
  });

  const restarted = await restartApp();

  const { body } = await get<RunState>(restarted.app, `/runs/${runId}`);
  expect(body.status).toBe("failed");
  expect(stageOf(body, "requirements").status).toBe("failed");
  expect(stageOf(body, "requirements").logs.at(-1)?.message).toMatch(
    /Interrupted by server restart/,
  );
  expect(stageOf(body, "intake").status).toBe("passed");
  await restarted.orchestrator.shutdown();
});

test("run numbering continues from the highest number on disk", async () => {
  const { app } = ctx;
  const first = await startRun(app, {
    pipelineId: "sequential",
    task: "comp numbering",
    disabledStages: ["requirements", "design", "review", "test", "release", "deploy"],
    ...FAST_SIM,
  });
  await waitForRunStatus(app, first.id, "completed");
  expect(first.number).toBe(1);
  await ctx.orchestrator.shutdown();

  const restarted = await restartApp();
  const second = await startRun(restarted.app, {
    pipelineId: "sequential",
    task: "comp numbering after restart",
    disabledStages: ["requirements", "design", "review", "test", "release", "deploy"],
    ...FAST_SIM,
  });

  expect(second.number).toBe(2);
  await waitForRunStatus(restarted.app, second.id, "completed");
  await restarted.orchestrator.shutdown();
});

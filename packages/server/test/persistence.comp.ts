// What survives a restart. The orchestrator is in-memory, so everything a user
// sees after the server comes back has to have been reconstructed from
// .adhd/runs/<id>/ — this suite is what proves that round trip.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import type { RunState } from "@adhd/core";
import { createApp } from "../src/app.js";
import { RunOrchestrator } from "../src/services/run-orchestrator.js";
import {
  FAST_SIM,
  createTestApp,
  get,
  stageOf,
  startRun,
  waitForRunStatus,
} from "./support/harness.js";
import type { TestApp } from "./support/harness.js";

let ctx: TestApp;

beforeEach(async () => {
  ctx = await createTestApp();
});

afterEach(async () => {
  await ctx.dispose();
});

function statePath(home: string, runId: string): string {
  return path.join(home, "runs", runId, "state.json");
}

/**
 * Stand up a second orchestrator over the same data root — the component-test
 * equivalent of restarting the server.
 */
async function restart() {
  const orchestrator = new RunOrchestrator();
  await orchestrator.init();
  return { app: createApp({ orchestrator }), orchestrator };
}

test("a finished run is written to state.json and its events to events.jsonl", async () => {
  // Arrange
  const { app, home } = ctx;

  // Act
  const run = await startRun(app, {
    pipelineId: "sequential",
    task: "comp persisted",
    disabledStages: ["requirements", "design", "review", "test", "release", "deploy"],
    ...FAST_SIM,
  });

  // Assert
  await waitForRunStatus(app, run.id, "completed");
  await ctx.orchestrator.shutdown();

  const state = JSON.parse(await readFile(statePath(home, run.id), "utf8")) as {
    version: number;
    run: RunState;
  };
  expect(state.version).toBe(1);
  expect(state.run.task).toBe("comp persisted");
  expect(state.run.status).toBe("completed");

  const events = await readFile(path.join(home, "runs", run.id, "events.jsonl"), "utf8");
  const types = events
    .trim()
    .split("\n")
    .map((line) => (JSON.parse(line) as { type: string }).type);
  expect(types).toContain("run.started");
  expect(types).toContain("stage.completed");
  expect(types).toContain("run.completed");
});

test("runs are restored from disk when the server comes back", async () => {
  // Arrange
  const { app } = ctx;
  const run = await startRun(app, {
    pipelineId: "sequential",
    task: "comp survives restart",
    disabledStages: ["requirements", "design", "review", "test", "release", "deploy"],
    ...FAST_SIM,
  });
  await waitForRunStatus(app, run.id, "completed");
  await ctx.orchestrator.shutdown();

  // Act
  const restarted = await restart();

  // Assert
  const { body } = await get<RunState[]>(restarted.app, "/runs");
  expect(body).toHaveLength(1);
  const [restoredRun] = body;
  expect(restoredRun?.id).toBe(run.id);
  expect(restoredRun?.task).toBe("comp survives restart");
  expect(restoredRun?.status).toBe("completed");
  await restarted.orchestrator.shutdown();
});

test("a run left mid-flight by a crash is reconciled to failed, not left running", async () => {
  // Arrange — a state.json written as if the process died with a stage running.
  const { home } = ctx;
  const runId = "crashed1";
  const interrupted: RunState = {
    id: runId,
    number: 7,
    pipelineId: "sequential",
    pipelineName: "Sequential lifecycle",
    status: "running",
    task: "comp interrupted",
    stages: [
      { id: "intake", label: "Intake", status: "passed", logs: [] },
      { id: "requirements", label: "Requirements", status: "running", logs: [] },
    ],
    createdAt: new Date().toISOString(),
  };
  await mkdir(path.dirname(statePath(home, runId)), { recursive: true });
  await writeFile(
    statePath(home, runId),
    JSON.stringify({ version: 1, run: interrupted }, null, 2),
  );

  // Act
  const restarted = await restart();

  // Assert
  const { body } = await get<RunState>(restarted.app, `/runs/${runId}`);
  expect(body.status).toBe("failed");
  expect(stageOf(body, "requirements").status).toBe("failed");
  expect(stageOf(body, "requirements").logs.at(-1)?.message).toMatch(
    /Interrupted by server restart/,
  );
  // Work that had already finished is left alone.
  expect(stageOf(body, "intake").status).toBe("passed");
  await restarted.orchestrator.shutdown();
});

test("run numbering continues from the highest number on disk", async () => {
  // Arrange
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

  // Act
  const restarted = await restart();
  const second = await startRun(restarted.app, {
    pipelineId: "sequential",
    task: "comp numbering after restart",
    disabledStages: ["requirements", "design", "review", "test", "release", "deploy"],
    ...FAST_SIM,
  });

  // Assert
  expect(second.number).toBe(2);
  await waitForRunStatus(restarted.app, second.id, "completed");
  await restarted.orchestrator.shutdown();
});

test("a corrupt state.json is skipped instead of stopping the restore", async () => {
  // Arrange
  const { app, home } = ctx;
  const healthy = await startRun(app, {
    pipelineId: "sequential",
    task: "comp healthy",
    disabledStages: ["requirements", "design", "review", "test", "release", "deploy"],
    ...FAST_SIM,
  });
  await waitForRunStatus(app, healthy.id, "completed");
  await ctx.orchestrator.shutdown();
  await mkdir(path.dirname(statePath(home, "corrupt1")), { recursive: true });
  await writeFile(statePath(home, "corrupt1"), "{ not json at all");

  // Act
  const restarted = await restart();

  // Assert
  const { body } = await get<RunState[]>(restarted.app, "/runs");
  expect(body.map((run) => run.id)).toEqual([healthy.id]);
  await restarted.orchestrator.shutdown();
});

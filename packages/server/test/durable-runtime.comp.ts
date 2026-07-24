// The durability guarantees TASK-068 adds on top of the ported behaviour:
//   M6/M7 — a gate parked when the process dies resumes in a fresh process and
//           does NOT re-run the stage that had already completed.
//   G2/S5 — one active run per project; a second is refused, but another
//           project runs concurrently, and the slot frees when the run ends.
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  addTestProject,
  createTestApp,
  FAST_SIM,
  getRun,
  post,
  restartApp,
  startRun,
  stageOf,
  waitForRunStatus,
  waitForStageStatus,
} from "./support/harness.ts";
import type { TestApp } from "./support/harness.ts";

// The `sequential` pipeline with its other two gates disabled — one gate
// (requirements) so the run parks exactly once.
const ONE_GATE_RUN = {
  pipelineId: "sequential",
  disabledStages: ["design", "release"],
  ...FAST_SIM,
};

// No gates at all — runs straight to completion without approval.
const NO_GATE_RUN = {
  pipelineId: "sequential",
  disabledStages: ["requirements", "design", "release"],
  ...FAST_SIM,
};

describe("durable runtime", () => {
  let ctx: TestApp;

  beforeEach(async () => {
    ctx = await createTestApp();
  });

  afterEach(async () => {
    await ctx.dispose();
  });

  test("a gate survives a hard restart and the completed stage is not re-run (M6/M7)", async () => {
    const project = await addTestProject(ctx.registry, "durable");
    const run = await startRun(ctx.app, ONE_GATE_RUN, project.headers);
    await waitForStageStatus(ctx.app, run.id, "requirements", "awaiting");

    // "Kill" the process: stop the worker and release the DB handles, keeping
    // only what is on disk.
    await ctx.orchestrator.shutdown();

    // A fresh process over the same data roots restores the parked run.
    const restarted = await restartApp();
    const afterBoot = await getRun(restarted.app, run.id);
    expect(afterBoot.status).toBe("awaiting");
    expect(stageOf(afterBoot, "requirements").status).toBe("awaiting");

    // Approving in the fresh process resumes and finishes the run.
    await post(restarted.app, `/runs/${run.id}/gates/requirements/approve`, {}, project.headers);
    await waitForRunStatus(restarted.app, run.id, "completed");

    // M7: every stage started exactly once — nothing that had completed re-ran.
    const events = await restarted.orchestrator.replayEvents(run.id);
    const starts = events.filter((e) => e.type === "stage.started").map((e) => e.stageId);
    expect(starts.filter((id) => id === "intake")).toHaveLength(1);
    expect(starts.filter((id) => id === "requirements")).toHaveLength(1);

    await restarted.orchestrator.shutdown();
  });

  test("a project runs one at a time while another project runs concurrently (G2/S5)", async () => {
    const a = await addTestProject(ctx.registry, "adm-a");
    const b = await addTestProject(ctx.registry, "adm-b");

    // A gated run in A stays active (parked at its gate).
    const first = await startRun(ctx.app, ONE_GATE_RUN, a.headers);
    await waitForStageStatus(ctx.app, first.id, "requirements", "awaiting");

    // A second run in A is refused — one active run per project.
    const refused = await post<{ error: string }>(ctx.app, "/runs", ONE_GATE_RUN, a.headers);
    expect(refused.status).toBe(400);
    expect(refused.body.error).toMatch(/already active/i);

    // A run in project B is allowed to run concurrently.
    const inB = await startRun(ctx.app, NO_GATE_RUN, b.headers);
    await waitForRunStatus(ctx.app, inB.id, "completed");

    // Once A's run finishes, its project frees and a new run is admitted.
    await post(ctx.app, `/runs/${first.id}/gates/requirements/approve`, {}, a.headers);
    await waitForRunStatus(ctx.app, first.id, "completed");
    const third = await startRun(ctx.app, NO_GATE_RUN, a.headers);
    expect(third.number).toBe(2);
    await waitForRunStatus(ctx.app, third.id, "completed");
  });
});

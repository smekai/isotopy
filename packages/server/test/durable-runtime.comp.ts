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

const ONE_GATE_RUN = {
  pipelineId: "sequential",
  disabledStages: ["design", "release"],
  ...FAST_SIM,
};

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

    await ctx.orchestrator.shutdown();

    const restarted = await restartApp();
    const afterBoot = await getRun(restarted.app, run.id);
    expect(afterBoot.status).toBe("awaiting");
    expect(stageOf(afterBoot, "requirements").status).toBe("awaiting");

    await post(restarted.app, `/runs/${run.id}/gates/requirements/approve`, {}, project.headers);
    await waitForRunStatus(restarted.app, run.id, "completed");

    const events = await restarted.orchestrator.replayEvents(run.id);
    const starts = events.filter((e) => e.type === "stage.started").map((e) => e.stageId);
    expect(starts.filter((id) => id === "intake")).toHaveLength(1);
    expect(starts.filter((id) => id === "requirements")).toHaveLength(1);

    await restarted.orchestrator.shutdown();
  });

  test("a project runs one at a time while another project runs concurrently (G2/S5)", async () => {
    const a = await addTestProject(ctx.registry, "adm-a");
    const b = await addTestProject(ctx.registry, "adm-b");

    const first = await startRun(ctx.app, ONE_GATE_RUN, a.headers);
    await waitForStageStatus(ctx.app, first.id, "requirements", "awaiting");

    const refused = await post<{ error: string }>(ctx.app, "/runs", ONE_GATE_RUN, a.headers);
    expect(refused.status).toBe(400);
    expect(refused.body.error).toMatch(/already active/i);

    const inB = await startRun(ctx.app, NO_GATE_RUN, b.headers);
    await waitForRunStatus(ctx.app, inB.id, "completed");

    await post(ctx.app, `/runs/${first.id}/gates/requirements/approve`, {}, a.headers);
    await waitForRunStatus(ctx.app, first.id, "completed");
    const third = await startRun(ctx.app, NO_GATE_RUN, a.headers);
    expect(third.number).toBe(2);
    await waitForRunStatus(ctx.app, third.id, "completed");
  });
});

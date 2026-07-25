import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  addTestProject,
  createTestApp,
  getRun,
  post,
  restartApp,
  startRun,
  stageOf,
  waitForRunStatus,
  waitForStageStatus,
} from "./support/harness.ts";
import type { TestApp } from "./support/harness.ts";

const TASK = "add a greet function";
const DEV_REPORT = "Implemented it. MARKER-DEVELOPER";
const TESTER_REPORT = "Verified it.\n\nVERDICT: PASS";

describe("durable runtime", () => {
  let ctx: TestApp;

  beforeEach(async () => {
    ctx = await createTestApp();
  });

  afterEach(async () => {
    await ctx.dispose();
  });

  test("a gate survives a hard restart and the completed stage is not re-run (M6/M7)", async () => {
    // Arrange
    const project = await addTestProject(ctx.registry, "durable");
    ctx.engine.anticipate({ as: "Developer" }).reports(DEV_REPORT);
    const run = await startRun(
      ctx.app,
      { pipelineId: "gated-dev-test", task: TASK, engine: "claude-code" },
      project.headers,
    );
    await waitForStageStatus(ctx.app, run.id, "implementation", "awaiting");

    // "Kill" the process, then boot a fresh one over the same data roots.
    await ctx.orchestrator.shutdown();
    const restarted = await restartApp();
    const afterBoot = await getRun(restarted.app, run.id);
    expect(afterBoot.status).toBe("awaiting");
    expect(stageOf(afterBoot, "implementation").status).toBe("awaiting");

    // Approving in the fresh process resumes and finishes the run.
    ctx.engine.anticipate({ as: "Tester" }).reports(TESTER_REPORT);
    await post(restarted.app, `/runs/${run.id}/gates/implementation/approve`, {}, project.headers);
    const finished = await waitForRunStatus(restarted.app, run.id, "completed");

    // M7: exactly two engine calls — Developer (before the crash) was replayed
    // from SQLite on resume, not re-run.
    expect(ctx.engine.calls.length).toBe(2);
    expect(stageOf(finished, "implementation").status).toBe("passed");
    expect(finished.stageOutputs?.implementation).toBe(DEV_REPORT);

    await restarted.orchestrator.shutdown();
  });

  test("a project runs one at a time while another project runs concurrently (G2/S5)", async () => {
    // Arrange
    const a = await addTestProject(ctx.registry, "adm-a");
    const b = await addTestProject(ctx.registry, "adm-b");

    // A gated run in A stays active (parked at its gate).
    ctx.engine.anticipate({ as: "A Developer" }).reports(DEV_REPORT);
    const first = await startRun(
      ctx.app,
      { pipelineId: "gated-dev-test", task: TASK, engine: "claude-code" },
      a.headers,
    );
    await waitForStageStatus(ctx.app, first.id, "implementation", "awaiting");

    // A second run in A is refused — one active run per project.
    const refused = await post<{ error: string }>(
      ctx.app,
      "/runs",
      { pipelineId: "one-box", task: TASK, engine: "claude-code" },
      a.headers,
    );
    expect(refused.status).toBe(400);
    expect(refused.body.error).toMatch(/already active/i);

    // A run in project B is allowed to run concurrently.
    ctx.engine.anticipate({ as: "B Developer" }).reports(DEV_REPORT);
    const inB = await startRun(
      ctx.app,
      { pipelineId: "one-box", task: TASK, engine: "claude-code" },
      b.headers,
    );
    await waitForRunStatus(ctx.app, inB.id, "completed");

    // Once A's run finishes, its project frees and a new run is admitted.
    ctx.engine.anticipate({ as: "A Tester" }).reports(TESTER_REPORT);
    await post(ctx.app, `/runs/${first.id}/gates/implementation/approve`, {}, a.headers);
    await waitForRunStatus(ctx.app, first.id, "completed");

    ctx.engine.anticipate({ as: "A Developer 2" }).reports(DEV_REPORT);
    const third = await startRun(
      ctx.app,
      { pipelineId: "one-box", task: TASK, engine: "claude-code" },
      a.headers,
    );
    expect(third.number).toBe(2);
    await waitForRunStatus(ctx.app, third.id, "completed");
  });
});

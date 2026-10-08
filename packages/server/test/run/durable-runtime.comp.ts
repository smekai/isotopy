import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  addTestProject,
  createTestApp,
  getRun,
  post,
  restartApp,
  startRun,
  stageOf,
  tablesIn,
  waitForRunStatus,
  waitForStageStatus,
} from "../support/harness.ts";
import type { TestApp } from "../support/harness.ts";

const TASK = "add a greet function";
const PM_REPORT = "Build a greet function. Done when it prints a greeting.";
const DEV_REPORT = "Implemented it. MARKER-DEVELOPER";
const TESTER_REPORT = "Verified it.\n\nVERDICT: PASS";

describe("durable runtime", () => {
  let ctx: TestApp;

  beforeEach(async () => {
    ctx = await createTestApp();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await ctx.dispose();
  });

  test("shutdown also stops an engine call that begins while it is stopping", async () => {
    // Arrange — the Windows CI hang behind PR #82: shutdown aborts the calls in
    // flight, then waits for the worker, and the workflow it is waiting on goes
    // on to start another call. Here the aborted stage's run moves on to its
    // review, which begins after the abort and would hang the shutdown forever.
    ctx.engine.anticipate({ as: "Agent, in flight at shutdown" }).hangsUntilAborted();
    ctx.engine.anticipate({ as: "review, begun during shutdown" }).hangsUntilAborted();
    await startRun(ctx.app, { pipelineId: "solo", task: TASK, engine: "claude-code" });
    await ctx.engine.waitForCall(1);

    // Act
    await ctx.orchestrator.shutdown();

    // Assert
    expect(ctx.engine.calls).toHaveLength(2);
  });

  test("a gate survives a hard restart and the completed stage is not re-run (M6/M7)", async () => {
    // Arrange — pm-dev-test gates after the Project Manager's recommendation.
    const project = await addTestProject(ctx.registry, "durable");
    ctx.engine.anticipate({ as: "Project Manager" }).reports(PM_REPORT);
    const run = await startRun(
      ctx.app,
      { pipelineId: "pm-dev-test", task: TASK, engine: "claude-code" },
      project.headers,
    );
    await waitForStageStatus(ctx.app, run.id, "intake", "awaiting");

    // "Kill" the process, then boot a fresh one over the same data roots.
    await ctx.orchestrator.shutdown();
    const restarted = await restartApp();
    const afterBoot = await getRun(restarted.app, run.id);
    expect(afterBoot.status).toBe("awaiting");
    expect(stageOf(afterBoot, "intake").status).toBe("awaiting");

    // Approving in the fresh process resumes and finishes the run.
    ctx.engine.anticipate({ as: "Developer" }).reports(DEV_REPORT);
    ctx.engine.anticipate({ as: "Tester" }).reports(TESTER_REPORT);
    ctx.engine.anticipateRunReview();
    await post(restarted.app, `/runs/${run.id}/gates/intake/approve`, {}, project.headers);
    const finished = await waitForRunStatus(restarted.app, run.id, "completed");

    // M7: four engine calls — three stages plus the Orchestrator's review. The
    // Project Manager (before the crash) was replayed from SQLite, not re-run.
    expect(ctx.engine.calls.length).toBe(4);
    expect(stageOf(finished, "intake").status).toBe("passed");
    expect(finished.stageOutputs?.intake).toBe(PM_REPORT);

    await restarted.shutdown();
  });

  test("a run that finished while its read model missed the end settles on the next boot", async () => {
    // Arrange — the run's closing write is lost, as if the process died just
    // after Aiki recorded the end and before the read model saved it.
    const closing = vi.spyOn(ctx.orchestrator, "runCompleted").mockResolvedValueOnce(undefined);
    ctx.engine.anticipate({ as: "Agent" }).reports(DEV_REPORT);
    ctx.engine.anticipateRunReview();
    const run = await startRun(ctx.app, { pipelineId: "solo", task: TASK, engine: "claude-code" });
    await vi.waitFor(() => expect(closing).toHaveBeenCalled(), { timeout: 5_000 });
    await ctx.orchestrator.shutdown();

    // Act
    const restarted = await restartApp();

    // Assert
    expect((await getRun(restarted.app, run.id)).status).toBe("completed");
    await restarted.shutdown();
  });

  test("a stage whose work throws fails once, without running its engine again, and the run settles as failed", async () => {
    // Arrange — recording the stage's pass is the last thing its work does, so the
    // engine call has already been paid for when it throws.
    vi.spyOn(ctx.orchestrator, "stagePassed").mockImplementationOnce(() => {
      throw new Error("the stage's output could not be recorded");
    });

    // Anticipate
    ctx.engine.anticipate({ as: "Agent" }).reports(DEV_REPORT);
    ctx.engine.anticipateRunReview();

    // Act
    const run = await startRun(ctx.app, { pipelineId: "solo", task: TASK, engine: "claude-code" });

    // Assert
    const finished = await waitForRunStatus(ctx.app, run.id, "failed");
    expect(stageOf(finished, "solo").status).toBe("failed");
    ctx.engine.verify();
  });

  test("a project runs one at a time while another project runs concurrently (G2/S5)", async () => {
    // Arrange
    const a = await addTestProject(ctx.registry, "adm-a");
    const b = await addTestProject(ctx.registry, "adm-b");

    // A gated run in A stays active (parked at its gate).
    ctx.engine.anticipate({ as: "A Project Manager" }).reports(PM_REPORT);
    const first = await startRun(
      ctx.app,
      { pipelineId: "pm-dev-test", task: TASK, engine: "claude-code" },
      a.headers,
    );
    await waitForStageStatus(ctx.app, first.id, "intake", "awaiting");

    // A second run in A is refused — one active run per project.
    const refused = await post<{ error: string }>(
      ctx.app,
      "/runs",
      { pipelineId: "solo", task: TASK, engine: "claude-code" },
      a.headers,
    );
    expect(refused.status).toBe(400);
    expect(refused.body.error).toMatch(/already active/i);

    // A run in project B is allowed to run concurrently.
    ctx.engine.anticipate({ as: "B Agent" }).reports(DEV_REPORT);
    ctx.engine.anticipateRunReview({ as: "B review" });
    const inB = await startRun(
      ctx.app,
      { pipelineId: "solo", task: TASK, engine: "claude-code" },
      b.headers,
    );
    await waitForRunStatus(ctx.app, inB.id, "completed");

    // Once A's run finishes, its project frees and a new run is admitted.
    ctx.engine.anticipate({ as: "A Developer" }).reports(DEV_REPORT);
    ctx.engine.anticipate({ as: "A Tester" }).reports(TESTER_REPORT);
    ctx.engine.anticipateRunReview({ as: "A review" });
    await post(ctx.app, `/runs/${first.id}/gates/intake/approve`, {}, a.headers);
    await waitForRunStatus(ctx.app, first.id, "completed");

    ctx.engine.anticipate({ as: "A Agent 2" }).reports(DEV_REPORT);
    ctx.engine.anticipateRunReview({ as: "A review, second run" });
    const third = await startRun(
      ctx.app,
      { pipelineId: "solo", task: TASK, engine: "claude-code" },
      a.headers,
    );
    expect(third.number).toBe(2);
    await waitForRunStatus(ctx.app, third.id, "completed");
  });

  test("the durable runtime keeps its own database, so it never waits on a lock Isotopy holds", async () => {
    // Arrange — Aiki writes through its own connection and migrates its own schema.
    // Sharing a file with Isotopy's writer would make two connections contend for
    // one write lock, so the two must never be the same file.
    const project = await addTestProject(ctx.registry, "split-db");
    ctx.engine.anticipate({ as: "Agent" }).reports(DEV_REPORT);
    ctx.engine.anticipateRunReview();

    // Act
    const run = await startRun(
      ctx.app,
      { pipelineId: "solo", task: TASK, engine: "claude-code" },
      project.headers,
    );

    // Assert
    await waitForRunStatus(ctx.app, run.id, "completed");
    expect(tablesIn(project.root, "aiki.db")).toContain("workflow_run");
    expect(tablesIn(project.root, "runs.db")).not.toContain("workflow_run");
  });

  test("the runtime reports into the operator log as its own component, with the fields it binds", async () => {
    // Anticipate
    ctx.engine.anticipate({ as: "Agent" }).reports(DEV_REPORT);
    ctx.engine.anticipateRunReview();

    // Act
    const run = await startRun(ctx.app, { pipelineId: "solo", task: TASK, engine: "claude-code" });

    // Assert
    await waitForRunStatus(ctx.app, run.id, "completed");
    expect(ctx.logger.at("info")).toContainEqual(
      expect.objectContaining({
        component: "Aiki",
        fields: expect.objectContaining({ "aiki.component": "worker" }),
      }),
    );
  });
});

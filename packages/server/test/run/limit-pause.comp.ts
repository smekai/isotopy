import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  addTestProject,
  createTestApp,
  getRun,
  post,
  put,
  restartApp,
  startRun,
  stageOf,
  waitForRunStatus,
  waitForStageStatus,
} from "../support/harness.ts";
import type { TestApp } from "../support/harness.ts";
import { LIMIT_ERRORS } from "../../src/domain/rules/limit-copy.ts";
import { setEngineAdapter } from "../../src/engines/registry.ts";

const TASK = "add a greet function";
const PM_REPORT = "Build a greet function. Done when it prints a greeting.";
const DEV_REPORT = "Implemented it. MARKER-DEVELOPER";
const TESTER_REPORT = "Verified it.\n\nVERDICT: PASS";

// The verbatim trigger from TASK-061.
const SESSION_LIMIT = "You've hit your session limit · resets 4:30pm (Europe/Tallinn)";
const SHORT_LIMIT = "You've hit your session limit · try again in 2 seconds";

const CURSOR_PIN = "cursor-grok-4.5-high";

describe("plan limit", () => {
  let ctx: TestApp;

  beforeEach(async () => {
    ctx = await createTestApp();
  });

  afterEach(async () => {
    await ctx.dispose();
  });

  test("a plan limit parks the run instead of failing it, carrying the reset time", async () => {
    // Arrange
    const project = await addTestProject(ctx.registry, "limit-park");
    // Anticipate — the engine reports the limit rather than a plain crash.
    ctx.engine.anticipate({ as: "Agent" }).hitsLimit(SESSION_LIMIT);

    // Act
    const run = await startRun(
      ctx.app,
      { pipelineId: "solo", task: TASK, engine: "claude-code" },
      project.headers,
    );

    // Assert
    const blocked = await waitForStageStatus(ctx.app, run.id, "solo", "blocked");
    expect(blocked.status).toBe("blocked");
    expect(blocked.limit?.raw).toBe(SESSION_LIMIT);
    expect(blocked.limit?.resetAt).toBeDefined();
    expect(blocked.limit?.attempt).toBe(1);
    ctx.engine.verify();
  });

  test("resolving with a new model resumes the same stage without re-running finished ones", async () => {
    // Arrange — pm-dev-test gates after intake, so the Project Manager is finished
    // work by the time the Developer hits the limit.
    const project = await addTestProject(ctx.registry, "limit-switch");
    ctx.engine.anticipate({ as: "Project Manager", model: "opus" }).reports(PM_REPORT);
    ctx.engine.anticipate({ as: "Developer", model: "opus" }).hitsLimit(SESSION_LIMIT);
    ctx.engine.anticipate({ as: "Developer on Haiku", model: "haiku" }).reports(DEV_REPORT);
    ctx.engine.anticipate({ as: "Tester", model: "haiku" }).reports(TESTER_REPORT);
    ctx.engine.anticipateRunReview();
    const run = await startRun(
      ctx.app,
      { pipelineId: "pm-dev-test", task: TASK, engine: "claude-code", model: "opus" },
      project.headers,
    );
    await waitForStageStatus(ctx.app, run.id, "intake", "awaiting");
    await post(ctx.app, `/runs/${run.id}/gates/intake/approve`, {}, project.headers);
    await waitForStageStatus(ctx.app, run.id, "implementation", "blocked");

    // Act
    const resumed = await post(
      ctx.app,
      `/runs/${run.id}/limit/implementation/resolve`,
      { choice: "switch-tier", tier: "fast" },
      project.headers,
    );

    // Assert
    expect(resumed.status).toBe(200);
    const finished = await waitForRunStatus(ctx.app, run.id, "completed");
    expect(finished.modelTier).toBe("fast");
    expect(finished.stageOutputs?.intake).toBe(PM_REPORT);
    expect(finished.limit).toBeUndefined();
    // Four calls, not five: the Project Manager was never re-run.
    ctx.engine.verify();
  });

  test("switching engine on a limit runs the rest on the owner's pin for that engine", async () => {
    // Arrange — TASK-191: Claude Code pinned to Sonnet runs out, and the owner
    // pinned Cursor to Grok as the fallback. Without the pin the switched run
    // climbs Cursor's tier ladder instead, which is not what anybody chose.
    // The same fake answers for Cursor too: the harness fakes one engine, and an
    // unfaked one is the real CLI on this machine.
    setEngineAdapter("cursor", ctx.engine);
    const project = await addTestProject(ctx.registry, "limit-switch-engine");
    await put(ctx.app, "/settings/preferences", { engineModels: { cursor: CURSOR_PIN } }, project.headers);
    ctx.engine.anticipate({ as: "Agent on Sonnet", model: "sonnet" }).hitsLimit(SESSION_LIMIT);
    ctx.engine.anticipate({ as: "Agent on the Cursor pin", model: CURSOR_PIN }).reports(DEV_REPORT);
    ctx.engine.anticipateRunReview({ as: "review on the Cursor pin" });
    const run = await startRun(
      ctx.app,
      { pipelineId: "solo", task: TASK, engine: "claude-code", model: "sonnet", modelTier: "deep" },
      project.headers,
    );
    await waitForStageStatus(ctx.app, run.id, "solo", "blocked");

    // Act
    const resumed = await post(
      ctx.app,
      `/runs/${run.id}/limit/solo/resolve`,
      { choice: "switch-engine", engine: "cursor" },
      project.headers,
    );

    // Assert
    expect(resumed.status).toBe(200);
    const finished = await waitForRunStatus(ctx.app, run.id, "completed");
    expect(finished).toMatchObject({ engine: "cursor", model: CURSOR_PIN });
    ctx.engine.verify();
  });

  test("a run parked on a limit is still parked after a hard restart", async () => {
    // Arrange
    const project = await addTestProject(ctx.registry, "limit-restart");
    ctx.engine.anticipate({ as: "Agent" }).hitsLimit(SESSION_LIMIT);
    const run = await startRun(
      ctx.app,
      { pipelineId: "solo", task: TASK, engine: "claude-code" },
      project.headers,
    );
    await waitForStageStatus(ctx.app, run.id, "solo", "blocked");
    await ctx.orchestrator.shutdown();

    // Act
    const restarted = await restartApp();

    // Assert
    const afterBoot = await getRun(restarted.app, run.id);
    expect(afterBoot.status).toBe("blocked");
    expect(stageOf(afterBoot, "solo").status).toBe("blocked");
    expect(afterBoot.limit?.raw).toBe(SESSION_LIMIT);

    await restarted.shutdown();
  });

  test("a run parked on a limit resumes on its own after a hard restart once the reset passes", async () => {
    // Arrange — the reset timer is durable state, not a timer in the process that died.
    const project = await addTestProject(ctx.registry, "limit-restart-timeout");
    ctx.engine.anticipate({ as: "Agent" }).hitsLimit(SHORT_LIMIT);
    const run = await startRun(
      ctx.app,
      { pipelineId: "solo", task: TASK, engine: "claude-code" },
      project.headers,
    );
    await waitForStageStatus(ctx.app, run.id, "solo", "blocked");
    await ctx.orchestrator.shutdown();
    ctx.engine.anticipate({ as: "Agent after the reset" }).reports(DEV_REPORT);
    ctx.engine.anticipateRunReview();

    // Act
    const restarted = await restartApp();

    // Assert
    const finished = await waitForRunStatus(restarted.app, run.id, "completed");
    expect(finished.stageOutputs?.solo).toBe(DEV_REPORT);
    ctx.engine.verify();
    await restarted.shutdown();
  });

  test("the run resumes on its own once the parsed reset time passes", async () => {
    // Arrange
    const project = await addTestProject(ctx.registry, "limit-timeout");
    ctx.engine.anticipate({ as: "Agent" }).hitsLimit(SHORT_LIMIT);
    ctx.engine.anticipate({ as: "Agent after the reset" }).reports(DEV_REPORT);
    ctx.engine.anticipateRunReview();

    // Act
    const run = await startRun(
      ctx.app,
      { pipelineId: "solo", task: TASK, engine: "claude-code" },
      project.headers,
    );

    // Assert
    const finished = await waitForRunStatus(ctx.app, run.id, "completed");
    expect(finished.limit).toBeUndefined();
    expect(finished.stageOutputs?.solo).toBe(DEV_REPORT);
    ctx.engine.verify();
  });

  test("aborting while parked cancels the run and frees the project", async () => {
    // Arrange
    const project = await addTestProject(ctx.registry, "limit-abort");
    ctx.engine.anticipate({ as: "Agent" }).hitsLimit(SESSION_LIMIT);
    const run = await startRun(
      ctx.app,
      { pipelineId: "solo", task: TASK, engine: "claude-code" },
      project.headers,
    );
    await waitForStageStatus(ctx.app, run.id, "solo", "blocked");

    // Act
    await post(ctx.app, `/runs/${run.id}/abort`, {}, project.headers);

    // Assert
    const cancelled = await waitForRunStatus(ctx.app, run.id, "cancelled");
    expect(cancelled.limit).toBeUndefined();
    ctx.engine.anticipate({ as: "Next Agent" }).reports(DEV_REPORT);
    const next = await startRun(
      ctx.app,
      { pipelineId: "solo", task: TASK, engine: "claude-code" },
      project.headers,
    );
    await waitForRunStatus(ctx.app, next.id, "completed");
  });

  test("resolving a stage that is not parked is refused", async () => {
    // Arrange
    const project = await addTestProject(ctx.registry, "limit-guard");
    ctx.engine.anticipate({ as: "Agent" }).reports(DEV_REPORT);
    const run = await startRun(
      ctx.app,
      { pipelineId: "solo", task: TASK, engine: "claude-code" },
      project.headers,
    );
    await waitForRunStatus(ctx.app, run.id, "completed");

    // Act
    const refused = await post<{ error: string }>(
      ctx.app,
      `/runs/${run.id}/limit/solo/resolve`,
      { choice: "retry-now" },
      project.headers,
    );

    // Assert
    expect(refused.status).toBe(409);
    expect(refused.body.error).toBe(LIMIT_ERRORS.notBlocked("solo"));
  });
});

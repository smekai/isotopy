// TASK-117 lost a whole run to a model the account rejected: the id was offered,
// the run started, and the provider's 400 arrived mid-stage. A model the engine
// does not offer must now be refused before any stage runs.
import { afterEach, beforeEach, expect, test } from "vitest";
import {
  addTestProject,
  createTestApp,
  getRun,
  post,
  startRun,
  waitForRunStatus,
  waitForStageStatus,
} from "../support/harness.ts";
import type { TestApp } from "../support/harness.ts";

const TASK = "add a greet function";
const SESSION_LIMIT = "You've hit your session limit · resets 4:30pm (Europe/Tallinn)";

let ctx: TestApp;

beforeEach(async () => {
  ctx = await createTestApp();
});

afterEach(async () => {
  await ctx.dispose();
});

test("a run asking for a model the engine does not offer is refused", async () => {
  // Arrange
  const project = await addTestProject(ctx.registry, "model-unknown");

  // Act
  const { status } = await post(
    ctx.app,
    "/runs",
    { pipelineId: "solo", task: TASK, engine: "claude-code", model: "gpt-5-mini" },
    project.headers,
  );

  // Assert
  expect(status).toBe(400);
});

test("the refusal names the model and where to change it", async () => {
  // Arrange
  const project = await addTestProject(ctx.registry, "model-message");

  // Act
  const { body } = await post<{ error: string }>(
    ctx.app,
    "/runs",
    { pipelineId: "solo", task: TASK, engine: "claude-code", model: "gpt-5-mini" },
    project.headers,
  );

  // Assert
  expect(body.error).toBe(
    'Model "gpt-5-mini" isn\'t offered by Claude Code on this machine — pick one in ' +
      "Setup → AI Harness. An unlisted id has to be set in the CLI's own config file first.",
  );
});

test("a refused model never reaches the engine", async () => {
  // Arrange
  const project = await addTestProject(ctx.registry, "model-untouched");

  // Act
  await post(
    ctx.app,
    "/runs",
    { pipelineId: "solo", task: TASK, engine: "claude-code", model: "gpt-5-mini" },
    project.headers,
  );

  // Assert
  ctx.engine.verify();
});

test("Auto is accepted by every engine", async () => {
  // Arrange
  const project = await addTestProject(ctx.registry, "model-auto");
  ctx.engine.anticipate({ as: "Agent" }).reports("Done.");
  ctx.engine.anticipateRunReview();

  // Act
  const run = await startRun(
    ctx.app,
    { pipelineId: "solo", task: TASK, engine: "claude-code", model: "" },
    project.headers,
  );

  // Assert
  expect(run.status).toBe("pending");
});

test("a preset reaches the engine as the model and effort it stands for", async () => {
  // Arrange
  const project = await addTestProject(ctx.registry, "tier-resolved");
  ctx.engine.anticipate({ as: "Agent", model: "opus", effort: "high" }).reports("Done.");
  ctx.engine.anticipateRunReview();

  // Act
  const run = await startRun(
    ctx.app,
    { pipelineId: "solo", task: TASK, engine: "claude-code", modelTier: "deep" },
    project.headers,
  );

  // Assert
  await waitForRunStatus(ctx.app, run.id, "completed");
  ctx.engine.verify();
});

test("a pinned model wins over the preset and carries no effort of its own", async () => {
  // Arrange
  const project = await addTestProject(ctx.registry, "tier-overridden");
  ctx.engine.anticipate({ as: "Agent", model: "haiku", effort: undefined }).reports("Done.");
  ctx.engine.anticipateRunReview();

  // Act
  const run = await startRun(
    ctx.app,
    { pipelineId: "solo", task: TASK, engine: "claude-code", modelTier: "deep", model: "haiku" },
    project.headers,
  );

  // Assert
  const finished = await waitForRunStatus(ctx.app, run.id, "completed");
  expect(finished.model).toBe("haiku");
});

test("dropping to a cheaper preset releases a pinned model, so later stages resolve the ladder again", async () => {
  // Arrange
  const project = await addTestProject(ctx.registry, "limit-releases-pin");
  ctx.engine.anticipate({ as: "Agent", model: "sonnet" }).hitsLimit(SESSION_LIMIT);
  const run = await startRun(
    ctx.app,
    { pipelineId: "solo", task: TASK, engine: "claude-code", model: "sonnet" },
    project.headers,
  );
  await waitForStageStatus(ctx.app, run.id, "solo", "blocked");

  // Act
  await post(
    ctx.app,
    `/runs/${run.id}/limit/solo/resolve`,
    { choice: "switch-tier", tier: "fast" },
    project.headers,
  );

  // Assert
  const resumed = await getRun(ctx.app, run.id);
  expect(resumed.model).toBeUndefined();
  expect(resumed.modelTier).toBe("fast");
});

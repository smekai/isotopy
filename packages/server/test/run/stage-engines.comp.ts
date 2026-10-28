// TASK-207: a stage runs on the primary or the secondary engine. Two FakeEngines
// stand in for Claude Code (primary) and Codex (secondary), so each assertion
// says which CLI a stage reached, not just that some engine answered.
import { afterEach, beforeEach, expect, test } from "vitest";
import type { PipelineDefinition } from "@isotopy/core";
import { setEngineAdapter } from "../../src/engines/registry.ts";
import { createTestApp, post, put, stageOf, waitForRunStatus } from "../support/harness.ts";
import type { TestApp } from "../support/harness.ts";
import { FakeEngine } from "../support/fake-engine.ts";

const TASK = "add a share button";
const PLAN_REPORT = "Plan: a share button on the trip page. MARKER-PLAN";
const DEV_REPORT = "Added the share button. MARKER-DEVELOPER";
const REVIEW_PASS = "The diff matches the plan.\n\nVERDICT: PASS";
const CUT_OFF_SESSION = "9b1f6c1e-3a52-4c55-9d0f-2b8f3f6a1c11";
const CODEX_PIN = "gpt-6-sol";

const TEAM: PipelineDefinition = {
  id: "two-engine-team",
  name: "Two-engine team",
  description: "Plan and build on the primary engine, review on the secondary.",
  groups: [
    {
      stages: [
        { id: "plan", label: "Planning", skill: "project-manager", stepTask: "plan-feature" },
        { id: "implementation", label: "Implementing", skill: "developer", stepTask: "implement-feature" },
        {
          id: "review",
          label: "Reviewing",
          skill: "software-architect",
          stepTask: "review-implementation",
          engine: "secondary",
        },
      ],
    },
  ],
};

let ctx: TestApp;
let codex: FakeEngine;

beforeEach(async () => {
  ctx = await createTestApp();
  codex = new FakeEngine("codex");
  setEngineAdapter("codex", codex);
});

afterEach(async () => {
  await ctx.dispose();
});

test("a secondary stage runs on the secondary engine while the rest of the run stays on the primary", async () => {
  // Arrange
  await put(ctx.app, "/settings/preferences", { secondaryEngine: "codex" });

  // Anticipate — Claude Code plans, builds and reviews the run; Codex only reviews the code.
  ctx.engine.anticipate({ as: "Product Manager" }).reports(PLAN_REPORT);
  ctx.engine.anticipate({ as: "Developer" }).reports(DEV_REPORT);
  codex.anticipate({ as: "Reviewer on Codex" }).reports(REVIEW_PASS);
  ctx.engine.anticipateRunReview();

  // Act
  const run = await ctx.orchestrator.startComposedRun(ctx.registry.resolve(), TEAM, { task: TASK });

  // Assert
  const finished = await waitForRunStatus(ctx.app, run.id, "completed");
  expect(stageOf(finished, "implementation").engine).toBe("claude-code");
  expect(stageOf(finished, "review").engine).toBe("codex");
  ctx.engine.verify();
  codex.verify();
});

test("without a secondary engine a secondary stage runs on the primary and its log says so", async () => {
  // Anticipate — every call reaches Claude Code; Codex is never asked.
  ctx.engine.anticipate({ as: "Product Manager" }).reports(PLAN_REPORT);
  ctx.engine.anticipate({ as: "Developer" }).reports(DEV_REPORT);
  ctx.engine.anticipate({ as: "Reviewer on the primary" }).reports(REVIEW_PASS);
  ctx.engine.anticipateRunReview();

  // Act
  const run = await ctx.orchestrator.startComposedRun(ctx.registry.resolve(), TEAM, { task: TASK });

  // Assert
  const finished = await waitForRunStatus(ctx.app, run.id, "completed");
  expect(stageOf(finished, "review").engine).toBe("claude-code");
  expect(stageOf(finished, "review").logs.map((entry) => entry.level)).toContain("warn");
  expect(stageOf(finished, "implementation").logs.map((entry) => entry.level)).not.toContain("warn");
  ctx.engine.verify();
  codex.verify();
});

test("a secondary engine that is not logged in refuses the run before any stage starts, naming the engine", async () => {
  // Arrange
  await put(ctx.app, "/settings/preferences", { secondaryEngine: "codex" });
  codex.isLoggedOut();

  // Anticipate — none: a refused run must not reach either engine.

  // Act
  const started = ctx.orchestrator.startComposedRun(ctx.registry.resolve(), TEAM, { task: TASK });

  // Assert
  await expect(started).rejects.toThrow(/Codex/);
  ctx.engine.verify();
  codex.verify();
});

test("a secondary engine that is not installed refuses the run even when it connects with an API key", async () => {
  // Arrange — an API key skips the login question, but not whether the CLI exists.
  await put(ctx.app, "/settings/preferences", { secondaryEngine: "codex" });
  await put(ctx.app, "/settings/engines/codex", { connectionMode: "api-key", apiKey: "sk-test" });
  codex.isNotInstalled();

  // Anticipate — none: the primary stages must not run only to fail at the review.

  // Act
  const started = ctx.orchestrator.startComposedRun(ctx.registry.resolve(), TEAM, { task: TASK });

  // Assert
  await expect(started).rejects.toThrow(/Codex/);
  ctx.engine.verify();
  codex.verify();
});

test("a model pinned for one engine never reaches a stage on the other engine", async () => {
  // Arrange
  await put(ctx.app, "/settings/preferences", {
    secondaryEngine: "codex",
    engineModels: { codex: CODEX_PIN },
  });

  // Anticipate — Claude Code stages keep the run's pin; the Codex stage gets Codex's own.
  ctx.engine.anticipate({ as: "Product Manager", model: "haiku" }).reports(PLAN_REPORT);
  ctx.engine.anticipate({ as: "Developer", model: "haiku" }).reports(DEV_REPORT);
  codex.anticipate({ as: "Reviewer on Codex", model: CODEX_PIN }).reports(REVIEW_PASS);
  ctx.engine.anticipateRunReview();

  // Act
  const run = await ctx.orchestrator.startComposedRun(ctx.registry.resolve(), TEAM, {
    task: TASK,
    model: "haiku",
  });

  // Assert
  await waitForRunStatus(ctx.app, run.id, "completed");
  ctx.engine.verify();
  codex.verify();
});

test("restarting a cut-off secondary stage resumes its session on the secondary engine", async () => {
  // Arrange — the review times out on Codex, leaving a session behind.
  await put(ctx.app, "/settings/preferences", { secondaryEngine: "codex" });
  ctx.engine.anticipate({ as: "Product Manager" }).reports(PLAN_REPORT);
  ctx.engine.anticipate({ as: "Developer" }).reports(DEV_REPORT);
  codex.anticipate({ as: "Reviewer, cut off" }).timesOut(CUT_OFF_SESSION);
  ctx.engine.anticipateRunReview({ as: "Review of the cut-off attempt" });
  const run = await ctx.orchestrator.startComposedRun(ctx.registry.resolve(), TEAM, { task: TASK });
  await waitForRunStatus(ctx.app, run.id, "failed");

  // Anticipate — the retry goes back to Codex with the session it left, not to Claude Code.
  codex.anticipate({ as: "Reviewer, resumed", resumeSessionId: CUT_OFF_SESSION }).reports(REVIEW_PASS);
  ctx.engine.anticipateRunReview({ as: "Review of the resumed attempt" });

  // Act
  await post(ctx.app, `/runs/${run.id}/restart`, { stageId: "review" });

  // Assert
  await waitForRunStatus(ctx.app, run.id, "completed");
  ctx.engine.verify();
  codex.verify();
});

// What a run cost is data, not prose. The adapters used to format `total_cost_usd`
// into a log line and drop the number; now it lands on the stage. The load-bearing
// behaviour is that a stage's turns *accumulate* — a question loop runs the same
// stage several times, and the second turn must not erase the first turn's spend.
import { afterEach, beforeEach, expect, test } from "vitest";
import { runUsage } from "@adhd/core";
import {
  approveIntake,
  createTestApp,
  post,
  restartApp,
  get,
  startRun,
  stageOf,
  waitForRunStatus,
  waitForStageStatus,
} from "../support/harness.ts";
import type { TestApp } from "../support/harness.ts";
import type { RunState } from "@adhd/core";

const TASK = "add a settings page";
const SESSION = "sess-cost";
const QUESTION = "Which database should the settings live in?";

let ctx: TestApp;

beforeEach(async () => {
  ctx = await createTestApp();
});

afterEach(async () => {
  await ctx.dispose();
});

test("what a stage spent lands on the stage", async () => {
  // Arrange
  const { app, engine } = ctx;
  engine.anticipate({ as: "solo" }).reports("Done.", { costUsd: 0.042, turns: 3, durationMs: 8_100 });

  // Act
  const run = await startRun(app, { pipelineId: "solo", task: TASK, engine: "claude-code" });
  const finished = await waitForRunStatus(app, run.id, "completed");

  // Assert
  expect(stageOf(finished, "solo").usage).toEqual({
    costUsd: 0.042,
    turns: 3,
    durationMs: 8_100,
  });
});

test("a question loop's turns add up instead of the last one winning", async () => {
  // Arrange — the same stage runs twice, each turn costing money.
  const { app, engine } = ctx;
  engine.anticipate({ as: "opening turn" }).asks(QUESTION, SESSION, { costUsd: 0.02, turns: 1 });
  engine
    .anticipate({ as: "Orchestrator escalation", persona: /# Role: Orchestrator/ })
    .parks(
      fenced({
        action: "escalate_to_user",
        question: "Should the settings use SQLite?",
        originStageId: "solo",
      }),
      "usage-broker-session",
    );
  engine
    .anticipate({
      as: "Orchestrator routing",
      resumeSessionId: "usage-broker-session",
    })
    .reports(
      fenced({
        action: "route_to_agent",
        stageId: "solo",
        message: "Use SQLite.",
        rationale: "The user selected it",
      }),
    );
  engine
    .anticipate({ as: "resumed turn", resumeSessionId: SESSION, prompt: "Use SQLite." })
    .reports("Added the settings page.", { costUsd: 0.03, turns: 2 });

  // Act
  const run = await startRun(app, { pipelineId: "solo", task: TASK, engine: "claude-code" });
  await waitForStageStatus(app, run.id, "solo", "asking");
  await post(app, `/runs/${run.id}/messages`, { text: "SQLite" });
  const finished = await waitForRunStatus(app, run.id, "completed");

  // Assert — 0.05, not 0.03. An assignment here would report only the last turn.
  expect(stageOf(finished, "solo").usage).toEqual({ costUsd: 0.05, turns: 3 });
  engine.verify();
});

test("the run's total is the sum of its boxes", async () => {
  // Arrange
  const { app, engine } = ctx;
  engine.anticipate({ as: "Project Manager" }).reports("Build it with SQLite.", { costUsd: 0.01 });
  engine.anticipate({ as: "Developer" }).reports("Built it.", { costUsd: 0.2 });
  engine
    .anticipate({ as: "Tester" })
    .reports("Checked it.\n\nVERDICT: PASS", { costUsd: 0.04 });

  // Act
  const run = await startRun(app, { pipelineId: "pm-dev-test", task: TASK, engine: "claude-code" });
  await approveIntake(app, run.id);
  const finished = await waitForRunStatus(app, run.id, "completed");

  // Assert
  expect(runUsage(finished).costUsd).toBeCloseTo(0.25, 10);
});

test("an engine that reports nothing leaves the stage without usage", async () => {
  // Arrange — Cursor reports no spend at all, and that is not an error state.
  const { app, engine } = ctx;
  engine.anticipate({ as: "solo" }).reports("Done.");

  // Act
  const run = await startRun(app, { pipelineId: "solo", task: TASK, engine: "claude-code" });
  const finished = await waitForRunStatus(app, run.id, "completed");

  // Assert
  expect(stageOf(finished, "solo").usage).toBeUndefined();
  expect(runUsage(finished)).toEqual({});
});

test("spend survives a server restart", async () => {
  // Arrange
  const { app, engine } = ctx;
  engine.anticipate({ as: "solo" }).reports("Done.", { costUsd: 0.11, turns: 2 });
  const run = await startRun(app, { pipelineId: "solo", task: TASK, engine: "claude-code" });
  await waitForRunStatus(app, run.id, "completed");
  await ctx.orchestrator.shutdown();

  // Act
  const restarted = await restartApp();
  const { body } = await get<RunState>(restarted.app, `/runs/${run.id}`);

  // Assert — the number is persisted with the run, not held in memory.
  expect(stageOf(body, "solo").usage).toEqual({ costUsd: 0.11, turns: 2 });
  await restarted.shutdown();
}, 15_000);

function fenced(decision: unknown): string {
  return `\`\`\`adhd-orchestrator-decision\n${JSON.stringify(decision)}\n\`\`\``;
}

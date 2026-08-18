// An initiative's cost has to be the sum of what the user can see. A decision turn
// — brokering a specialist's question, or reviewing a run once it settles — is an
// engine turn the Orchestrator spends on the initiative's behalf, not work done by
// the run it happened inside. TASK-141 watched three such turns leave the
// Orchestrator's figure unchanged while the money was quietly booked against a
// stage that had not earned it.
import { afterEach, beforeEach, expect, test } from "vitest";
import { runUsage } from "@isotopy/core";
import type { Orchestration, RunState } from "@isotopy/core";
import {
  createTestApp,
  get,
  post,
  restartApp,
  startRun,
  waitForRunStatus,
  waitForStageStatus,
} from "../support/harness.ts";
import type { TestApp } from "../support/harness.ts";

const WORK_RUN = { pipelineId: "solo", task: "Add search to the product", engine: "claude-code" };
const QUESTION = "Which database should the settings live in?";
const SESSION = "sess-cost";
const BROKER_SESSION = "broker-cost";

let ctx: TestApp;

beforeEach(async () => {
  ctx = await createTestApp();
});

afterEach(async () => {
  await ctx.dispose();
});

test("a settle-time decision's spend lands on the initiative, not on the run that triggered it", async () => {
  // Anticipate — only the review costs anything, so the two figures cannot be confused.
  ctx.engine.anticipate({ as: "solo" }).reports("Built it.");
  ctx.engine.anticipateRunReview({ usage: { costUsd: 0.21, turns: 1 } });

  // Act
  const run = await startRun(ctx.app, WORK_RUN);

  // Assert
  const settled = await waitForRunStatus(ctx.app, run.id, "completed");
  expect(runUsage(settled)).toEqual({});
  expect((await initiative(settled)).usage).toEqual({ costUsd: 0.21, turns: 1 });
});

test("brokering a specialist's question is the Orchestrator's spend, not the specialist's", async () => {
  // Anticipate — only the broker turns cost anything, so the two figures cannot be confused.
  ctx.engine.anticipate({ as: "solo" }).asks(QUESTION, SESSION);
  ctx.engine
    .anticipate({ as: "Orchestrator escalation", persona: /# Role: Orchestrator/ })
    .parks(
      fenced({ action: "escalate_to_user", question: QUESTION, originStageId: "solo" }),
      BROKER_SESSION,
      { costUsd: 0.04, turns: 1 },
    );
  ctx.engine
    .anticipate({ as: "Orchestrator routing", resumeSessionId: BROKER_SESSION })
    .reports(
      fenced({
        action: "route_to_agent",
        stageId: "solo",
        message: "Use SQLite.",
        rationale: "The user selected it",
      }),
      { costUsd: 0.01, turns: 1 },
    );
  ctx.engine.anticipate({ as: "resumed solo", resumeSessionId: SESSION }).reports("Built it.");
  ctx.engine.anticipateRunReview();

  // Act
  const run = await startRun(ctx.app, WORK_RUN);

  // Assert
  await waitForStageStatus(ctx.app, run.id, "solo", "asking");
  await post(ctx.app, `/runs/${run.id}/messages`, { text: "SQLite" });
  const settled = await waitForRunStatus(ctx.app, run.id, "completed");
  expect(runUsage(settled)).toEqual({});
  expect((await initiative(settled)).usage).toEqual({ costUsd: 0.05, turns: 2 });
});

test("what the Orchestrator spent survives a server restart", async () => {
  // Arrange
  ctx.engine.anticipate({ as: "solo" }).reports("Built it.");
  ctx.engine.anticipateRunReview({ usage: { costUsd: 0.33 } });
  const run = await startRun(ctx.app, WORK_RUN);
  const settled = await waitForRunStatus(ctx.app, run.id, "completed");
  await ctx.orchestrator.shutdown();

  // Act
  const restarted = await restartApp();

  // Assert — the number is persisted with the initiative, not held in memory.
  const { body } = await get<Orchestration>(
    restarted.app,
    `/orchestrations/${settled.orchestrationId}`,
  );
  expect(body.usage).toEqual({ costUsd: 0.33 });
  await restarted.shutdown();
}, 15_000);

async function initiative(run: RunState): Promise<Orchestration> {
  const { body } = await get<Orchestration>(ctx.app, `/orchestrations/${run.orchestrationId}`);
  return body;
}

function fenced(decision: unknown): string {
  return `\`\`\`isotopy-orchestrator-decision\n${JSON.stringify(decision)}\n\`\`\``;
}

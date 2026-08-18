// An initiative's cost has to be the sum of what the user can see. A settle-time
// decision is an engine turn the Orchestrator spends on the initiative's behalf,
// not work done by the run that triggered it — TASK-141 watched three such turns
// leave the Orchestrator's figure unchanged while the money was quietly booked
// against whichever stage happened to be last in the settled run.
import { afterEach, beforeEach, expect, test } from "vitest";
import { runUsage } from "@isotopy/core";
import type { Orchestration, RunState } from "@isotopy/core";
import {
  createTestApp,
  get,
  restartApp,
  startRun,
  waitForRunStatus,
} from "../support/harness.ts";
import type { TestApp } from "../support/harness.ts";

const WORK_RUN = { pipelineId: "solo", task: "Add search to the product", engine: "claude-code" };

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

// TASK-178: every role keeps notes about a project, but the Orchestrator — the
// one agent that sees every run — started each episode knowing nothing of the
// last. It now keeps a small context of its own: rewritten whole at a review,
// capped so that it has to be curated, and read when the next episode opens.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import type { RunState } from "@isotopy/core";
import { orchestratorContextPath } from "../../src/services/skills.ts";
import { createTestApp, post, stageOf, startRun, waitForRunStatus } from "../support/harness.ts";
import type { TestApp } from "../support/harness.ts";

const TASK = "add a greet function";
const AGENT_REPORT = "Implemented it.";
const KEPT_LINE = "- The owner wants small pull requests.";
const STALE_LINE = "- The Preview is broken on Windows.";
const NEW_LINE = "- Two runs tried the README Node floor; the reviewer rejected both.";

let ctx: TestApp;

beforeEach(async () => {
  ctx = await createTestApp();
});

afterEach(async () => {
  await ctx.dispose();
});

test("a new episode opens with the context the Orchestrator kept before it", async () => {
  // Arrange — the file a previous episode's review left, or the owner edited.
  await writeContext(`${KEPT_LINE}\n`);

  // Anticipate
  ctx.engine
    .anticipate({ as: "Orchestrator", persona: /# Role: Orchestrator/, prompt: /The owner wants small pull requests/ })
    .reports(stopDecision());

  // Act
  const { body: run } = await post<RunState>(ctx.app, "/orchestrations", {
    goal: "Add search to the product",
    engine: "claude-code",
  });

  // Assert
  await waitForRunStatus(ctx.app, run.id, "completed");
  ctx.engine.verify();
});

test("a review that revises the context replaces it whole, so a line it drops is gone", async () => {
  // Arrange
  await writeContext(`${KEPT_LINE}\n${STALE_LINE}\n`);

  // Anticipate
  ctx.engine.anticipate({ as: "Agent" }).reports(AGENT_REPORT);
  ctx.engine.anticipateRunReview({ context: `${KEPT_LINE}\n${NEW_LINE}` });

  // Act
  const run = await startRun(ctx.app, { pipelineId: "solo", task: TASK, engine: "claude-code" });

  // Assert
  await waitForRunStatus(ctx.app, run.id, "completed");
  expect(await readContext()).toBe(`${KEPT_LINE}\n${NEW_LINE}\n`);
});

test("a revision over the cap is refused on the run's own log, and the context is kept", async () => {
  // Arrange
  await writeContext(`${KEPT_LINE}\n`);

  // Anticipate
  ctx.engine.anticipate({ as: "Agent" }).reports(AGENT_REPORT);
  ctx.engine.anticipateRunReview({ context: overCapContext() });

  // Act
  const run = await startRun(ctx.app, { pipelineId: "solo", task: TASK, engine: "claude-code" });

  // Assert
  const finished = await waitForRunStatus(ctx.app, run.id, "completed");
  expect(await readContext()).toBe(`${KEPT_LINE}\n`);
  expect(stageOf(finished, "solo").logs).toContainEqual(
    expect.objectContaining({ level: "warn", message: expect.stringContaining("61 lines") }),
  );
});

async function writeContext(text: string): Promise<void> {
  const file = orchestratorContextPath(ctx.registry.resolve());
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, text, "utf8");
}

function readContext(): Promise<string> {
  return readFile(orchestratorContextPath(ctx.registry.resolve()), "utf8");
}

function stopDecision(): string {
  return `Nothing to do.\n\n\`\`\`isotopy-orchestrator-decision\n${JSON.stringify({ action: "stop", reason: "goal met" })}\n\`\`\``;
}

function overCapContext(): string {
  return Array.from({ length: 61 }, (_, index) => `- note ${index + 1}`).join("\n");
}

// An initiative used to approve one team and reuse it for every later run, so a
// continuation that needed a different shape was forced through the original
// composition. TASK-141 watched run 3 exist only to fix one function and carry the
// whole five-role team, skipping planning by *seeding* rather than by being composed
// without it. These pin the two halves of the answer: a re-composition the user sees,
// and an unchanged one they are not interrupted for.
import { afterEach, beforeEach, expect, test } from "vitest";
import type {
  EngineId,
  Orchestration,
  OrchestratorDecision,
  OrchestratorTeamProposal,
  RunState,
} from "@isotopy/core";
import {
  createTestApp,
  get,
  post,
  waitForRunStatus,
} from "../support/harness.ts";
import type { TestApp } from "../support/harness.ts";

const DEVELOPER = { id: "implementation", label: "Developer", skill: "developer", stepTask: "implement-feature" };
const QA = { id: "test", label: "QA Engineer", skill: "tester", stepTask: "verify-feature" };

const PAIR: OrchestratorTeamProposal = {
  name: "Delivery pair",
  summary: "Build it and verify it",
  roles: [DEVELOPER, QA],
};

const SOLO: OrchestratorTeamProposal = {
  name: "Fix crew",
  summary: "One developer, nothing else",
  roles: [DEVELOPER],
};

const PROPOSE_PAIR: OrchestratorDecision = {
  action: "propose_team",
  rationale: "Build and verify",
  team: PAIR,
};

let ctx: TestApp;

beforeEach(async () => {
  ctx = await createTestApp();
});

afterEach(async () => {
  await ctx.dispose();
});

test("a review that proposes a different shape parks the initiative instead of launching it", async () => {
  // Anticipate — the settled run's review asks for a one-role team.
  await approvedPair();
  ctx.engine.anticipateRunReview({
    decision: {
      action: "propose_team",
      rationale: "This is a one-line fix; the pair is the wrong shape",
      task: "Fix the off-by-one in statusText",
      team: SOLO,
    },
  });

  // Act
  const composed = await runComposed();

  // Assert
  await waitForRunStatus(ctx.app, composed.id, "completed");
  const initiative = await waitForStatus(composed, "awaiting_approval");
  expect(initiative.latestDecision).toMatchObject({ action: "propose_team" });
});

test("a review that proposes the team already running starts the next run without asking", async () => {
  // Anticipate — same roles, so nothing needs the user's eye.
  await approvedPair();
  ctx.engine.anticipateRunReview({
    decision: {
      action: "propose_team",
      rationale: "The same pair can carry the follow-up",
      task: "Add the missing index",
      team: PAIR,
    },
  });
  ctx.engine.anticipate({ as: "second Developer" }).reports("Built it.\n\nVERDICT: PASS");
  ctx.engine.anticipate({ as: "second QA" }).reports("Checked it.\n\nVERDICT: PASS");
  ctx.engine.anticipateRunReview({ as: "second review" });

  // Act
  const composed = await runComposed();

  // Assert — a third run exists, and it carries the first team's pipeline rather
  // than a new generation, because nothing about the composition changed.
  await waitForRunStatus(ctx.app, composed.id, "completed");
  const initiative = await waitForRuns(composed, 3);
  const followUp = await runById(initiative.runIds[2]);
  expect(followUp.pipelineId).toBe(`team-${composed.orchestrationId}-1`);
});

test("approving a re-composed team runs the task the review asked for, not the initiative's goal", async () => {
  // Anticipate
  await approvedPair();
  ctx.engine.anticipateRunReview({
    decision: {
      action: "propose_team",
      rationale: "One role is enough",
      task: "Fix the off-by-one in statusText",
      team: SOLO,
    },
  });
  const composed = await runComposed();
  await waitForRunStatus(ctx.app, composed.id, "completed");
  await waitForStatus(composed, "awaiting_approval");
  ctx.engine.anticipate({ as: "fix Developer" }).reports("Fixed it.\n\nVERDICT: PASS");
  ctx.engine.anticipateRunReview({ as: "fix review" });

  // Act
  const { body: next } = await post<RunState>(
    ctx.app,
    `/orchestrations/${composed.orchestrationId}/approve`,
    { engine: "claude-code" },
  );

  // Assert
  expect(next.task).toBe("Fix the off-by-one in statusText");
});

test("a re-composed team runs under its own pipeline id, so its runs are not confused with the first team's", async () => {
  // Anticipate
  await approvedPair();
  ctx.engine.anticipateRunReview({
    decision: { action: "propose_team", rationale: "Smaller", task: "Fix it", team: SOLO },
  });
  const composed = await runComposed();
  await waitForRunStatus(ctx.app, composed.id, "completed");
  await waitForStatus(composed, "awaiting_approval");
  ctx.engine.anticipate({ as: "fix Developer" }).reports("Fixed it.\n\nVERDICT: PASS");
  ctx.engine.anticipateRunReview({ as: "fix review" });

  // Act
  const { body: next } = await post<RunState>(
    ctx.app,
    `/orchestrations/${composed.orchestrationId}/approve`,
    { engine: "claude-code" },
  );

  // Assert
  expect(next.pipelineId).toBe(`team-${composed.orchestrationId}-2`);
  expect(composed.pipelineId).toBe(`team-${composed.orchestrationId}-1`);
});

test("a proposal that names no task is refused, because nothing would tell the new team what to do", async () => {
  // Anticipate
  await approvedPair();
  ctx.engine.anticipateRunReview({
    decision: { action: "propose_team", rationale: "Smaller", team: SOLO },
  });

  // Act
  const composed = await runComposed();

  // Assert
  await waitForRunStatus(ctx.app, composed.id, "completed");
  const initiative = await waitForDecisionError(composed);
  expect(initiative.decisionError).toContain("must carry the task");
});

async function approvedPair(): Promise<void> {
  ctx.engine
    .anticipate({ as: "Orchestrator", persona: /# Role: Orchestrator/ })
    .reports(fenced(PROPOSE_PAIR));
  ctx.engine.anticipate({ as: "Developer" }).reports("Built it.\n\nVERDICT: PASS");
  ctx.engine.anticipate({ as: "QA Engineer" }).reports("Checked it.\n\nVERDICT: PASS");
}

async function runComposed(engine: EngineId = "claude-code"): Promise<RunState> {
  const { body: conversation } = await post<RunState>(ctx.app, "/orchestrations", {
    goal: "Add search to the product",
    engine,
  });
  await waitForRunStatus(ctx.app, conversation.id, "completed");
  const { body: composed } = await post<RunState>(
    ctx.app,
    `/orchestrations/${conversation.orchestrationId}/approve`,
    { engine },
  );
  return composed;
}

async function initiativeOf(run: RunState): Promise<Orchestration> {
  const { body } = await get<Orchestration>(ctx.app, `/orchestrations/${run.orchestrationId}`);
  return body;
}

async function waitForStatus(run: RunState, status: string): Promise<Orchestration> {
  return until(run, (initiative) => initiative.status === status);
}

async function waitForRuns(run: RunState, count: number): Promise<Orchestration> {
  return until(run, (initiative) => initiative.runIds.length >= count);
}

async function waitForDecisionError(run: RunState): Promise<Orchestration> {
  return until(run, (initiative) => initiative.decisionError !== undefined);
}

async function until(
  run: RunState,
  done: (initiative: Orchestration) => boolean,
): Promise<Orchestration> {
  const deadline = Date.now() + 10_000;
  let latest = await initiativeOf(run);
  while (!done(latest) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    latest = await initiativeOf(run);
  }
  return latest;
}

function fenced(decision: unknown): string {
  return `\`\`\`isotopy-orchestrator-decision\n${JSON.stringify(decision)}\n\`\`\``;
}

async function runById(runId: string | undefined): Promise<RunState> {
  const { body } = await get<RunState>(ctx.app, `/runs/${runId ?? "missing"}`);
  return body;
}

import { afterEach, beforeEach, expect, test } from "vitest";
import type { Orchestration, OrchestratorDecision, RunState } from "@adhd/core";
import {
  createTestApp,
  get,
  post,
  restartApp,
  waitForRunStatus,
  waitForStageStatus,
} from "../support/harness.ts";
import type { TestApp } from "../support/harness.ts";

const TEAM_PROPOSAL: OrchestratorDecision = {
  action: "propose_team",
  rationale: "One Developer and one QA Engineer cover this",
  team: {
    name: "Delivery pair",
    summary: "Build the search endpoint and verify it",
    roles: [
      {
        id: "implementation",
        label: "Developer",
        skill: "developer",
        stepTask: "implement-feature",
      },
      {
        id: "test",
        label: "QA Engineer",
        skill: "tester",
        stepTask: "verify-feature",
        executionPolicy: "quality",
      },
    ],
  },
};

let ctx: TestApp;

beforeEach(async () => {
  ctx = await createTestApp();
});

afterEach(async () => {
  await ctx.dispose();
});

test("an ask_user decision parks the Orchestrator on the user instead of finishing", async () => {
  // Anticipate — the Orchestrator's first turn needs something only the user knows.
  ctx.engine
    .anticipate({
      as: "Orchestrator question",
      persona: /# Role: Orchestrator/,
      prompt: /Persona catalog/,
    })
    .reports(fenced({ action: "ask_user", question: "Which database?" }));

  // Act
  const run = await startOrchestration();

  // Assert
  await waitForStageStatus(ctx.app, run.id, "orchestrate", "asking");
  const { body: orchestration } = await get<Orchestration>(
    ctx.app,
    `/orchestrations/${run.orchestrationId}`,
  );
  expect(orchestration).toMatchObject({
    status: "awaiting_user",
    latestDecision: { action: "ask_user", question: "Which database?" },
    runIds: [run.id],
  });
  ctx.engine.verify();
});

test("answering the parked question resumes the same session and records both turns", async () => {
  // Anticipate — the answer arrives on the session the question was asked from.
  ctx.engine
    .anticipate({ as: "Orchestrator question", persona: /# Role: Orchestrator/ })
    .parks(
      fenced({ action: "ask_user", question: "Which database?" }),
      "orchestration-session",
    );
  ctx.engine
    .anticipate({
      as: "Orchestrator proposal",
      resumeSessionId: "orchestration-session",
      prompt: /Postgres/,
    })
    .reports(fenced(TEAM_PROPOSAL));

  // Arrange
  const run = await startOrchestration();
  await waitForStageStatus(ctx.app, run.id, "orchestrate", "asking");

  // Act
  await post(ctx.app, `/runs/${run.id}/messages`, { text: "Postgres" });

  // Assert
  await waitForRunStatus(ctx.app, run.id, "completed");
  const { body: orchestration } = await get<Orchestration>(
    ctx.app,
    `/orchestrations/${run.orchestrationId}`,
  );
  expect(orchestration).toMatchObject({
    status: "awaiting_approval",
    latestDecision: { action: "propose_team" },
  });
  expect(orchestration.turns.map((turn) => turn.decision.action)).toEqual([
    "ask_user",
    "propose_team",
  ]);
  ctx.engine.verify();
});

test("a proposed team is stored unapproved — nothing is composed or started from it", async () => {
  // Anticipate
  ctx.engine
    .anticipate({ as: "Orchestrator", persona: /# Role: Orchestrator/ })
    .reports(fenced(TEAM_PROPOSAL));

  // Act
  const run = await startOrchestration();

  // Assert
  await waitForRunStatus(ctx.app, run.id, "completed");
  const { body: runs } = await get<RunState[]>(ctx.app, "/runs");
  const { body: orchestration } = await get<Orchestration>(
    ctx.app,
    `/orchestrations/${run.orchestrationId}`,
  );
  expect(runs.map((item) => item.pipelineId)).toEqual(["orchestration"]);
  expect(orchestration.latestDecision).toMatchObject({
    team: { roles: [{ skill: "developer" }, { skill: "tester" }] },
  });
  ctx.engine.verify();
});

test("a turn with no decision block needs attention and records why, rather than passing quietly", async () => {
  // Anticipate — a turn that reads well but says nothing the system can execute.
  ctx.engine
    .anticipate({ as: "Orchestrator", persona: /# Role: Orchestrator/ })
    .reports("I reckon a Developer and a tester would do nicely.");

  // Act
  const run = await startOrchestration();

  // Assert
  const finished = await waitForRunStatus(ctx.app, run.id, "needs_attention");
  const { body: orchestration } = await get<Orchestration>(
    ctx.app,
    `/orchestrations/${run.orchestrationId}`,
  );
  expect(stageMessage(finished)).toContain("no usable decision");
  expect(orchestration).toMatchObject({ status: "conversing", turns: [] });
  expect(orchestration.decisionError).toContain(
    "Missing fenced adhd-orchestrator-decision JSON block",
  );
  ctx.engine.verify();
});

test("a decision carrying an unknown field is rejected whole, not stripped down to what fits", async () => {
  // Anticipate
  ctx.engine
    .anticipate({ as: "Orchestrator", persona: /# Role: Orchestrator/ })
    .reports(fenced({ action: "stop", reason: "goal met", confidence: 0.9 }));

  // Act
  const run = await startOrchestration();

  // Assert
  await waitForRunStatus(ctx.app, run.id, "needs_attention");
  const { body: orchestration } = await get<Orchestration>(
    ctx.app,
    `/orchestrations/${run.orchestrationId}`,
  );
  expect(orchestration).toMatchObject({ status: "conversing", turns: [] });
  expect(orchestration.decisionError).toContain("confidence");
  ctx.engine.verify();
});

test("a start the project refuses leaves no orchestration behind", async () => {
  // Anticipate — the first run holds the project open; the orchestrator is never reached.
  ctx.engine.anticipate({ as: "solo" }).hangsUntilAborted();
  const blocking = await post<RunState>(ctx.app, "/runs", {
    pipelineId: "solo",
    task: "Hold the project",
    engine: "claude-code",
  });
  await ctx.engine.waitForCall();

  // Act — one project runs one thing at a time, so this is rejected.
  const rejected = await post<{ error: string }>(ctx.app, "/orchestrations", {
    goal: "Add search to the product",
    engine: "claude-code",
  });

  // Assert — on disk, not just in memory: a refused start must leave no durable
  // record, and nothing can delete one once written.
  await post(ctx.app, `/runs/${blocking.body.id}/abort`);
  await ctx.orchestrator.shutdown();
  const restarted = await restartApp();
  const { body: orchestrations } = await get<Orchestration[]>(
    restarted.app,
    "/orchestrations",
  );
  expect(rejected.status).toBe(400);
  expect(rejected.body.error).toContain("already active");
  expect(orchestrations).toEqual([]);
  await restarted.shutdown();
  ctx.engine.verify();
});

test("an orchestration parked on the user survives a server restart with its turns intact", async () => {
  // Anticipate
  ctx.engine
    .anticipate({ as: "Orchestrator question", persona: /# Role: Orchestrator/ })
    .parks(
      fenced({ action: "ask_user", question: "Which database?" }),
      "orchestration-session",
    );

  // Arrange
  const run = await startOrchestration();
  await waitForStageStatus(ctx.app, run.id, "orchestrate", "asking");
  await ctx.orchestrator.shutdown();

  // Act
  const restarted = await restartApp();

  // Assert — the aggregate and its parked run both come back from disk.
  const { body: orchestration } = await get<Orchestration>(
    restarted.app,
    `/orchestrations/${run.orchestrationId}`,
  );
  const { body: reloaded } = await get<RunState>(restarted.app, `/runs/${run.id}`);
  expect(reloaded.status).toBe("asking");
  expect(orchestration).toMatchObject({
    status: "awaiting_user",
    goal: "Add search to the product",
    latestDecision: { action: "ask_user" },
    runIds: [run.id],
  });
  await restarted.shutdown();
});

test("approving a proposed team starts a composed run carrying its own pipeline definition", async () => {
  // Anticipate — the Orchestrator proposes a team; the approved team then runs.
  ctx.engine
    .anticipate({ as: "Orchestrator", persona: /# Role: Orchestrator/ })
    .reports(fenced(TEAM_PROPOSAL));
  ctx.engine.anticipate({ as: "Developer" }).reports("Built it.\n\nVERDICT: PASS");
  ctx.engine.anticipate({ as: "QA Engineer" }).reports("Checked it.\n\nVERDICT: PASS");
  const conversation = await proposedTeam();

  // Act
  const { status, body: composed } = await post<RunState>(
    ctx.app,
    `/orchestrations/${conversation.orchestrationId}/approve`,
    { engine: "claude-code" },
  );

  // Assert — the definition travels on the run, since no constant can resolve it.
  expect(status, JSON.stringify(composed)).toBe(201);
  const finished = await waitForRunStatus(ctx.app, composed.id, "completed");
  expect(finished.pipelineId).toBe(`team-${conversation.orchestrationId}`);
  expect(finished.pipeline?.groups[0]?.stages).toMatchObject([
    { id: "implementation", executionPolicy: "standard" },
    { id: "test", executionPolicy: "quality" },
  ]);
  ctx.engine.verify();
});

test("approving records the team on the orchestration and moves it to running", async () => {
  // Anticipate
  ctx.engine
    .anticipate({ as: "Orchestrator", persona: /# Role: Orchestrator/ })
    .reports(fenced(TEAM_PROPOSAL));
  ctx.engine.anticipate({ as: "Developer" }).reports("Built it.\n\nVERDICT: PASS");
  ctx.engine.anticipate({ as: "QA Engineer" }).reports("Checked it.\n\nVERDICT: PASS");
  const conversation = await proposedTeam();

  // Act
  const { body: composed } = await post<RunState>(
    ctx.app,
    `/orchestrations/${conversation.orchestrationId}/approve`,
    { engine: "claude-code" },
  );

  // Assert — both runs belong to the orchestration, in the order they happened.
  await waitForRunStatus(ctx.app, composed.id, "completed");
  const { body: orchestration } = await get<Orchestration>(
    ctx.app,
    `/orchestrations/${conversation.orchestrationId}`,
  );
  expect(orchestration).toMatchObject({
    status: "running",
    approvedTeam: { name: "Delivery pair" },
    runIds: [conversation.id, composed.id],
  });
  ctx.engine.verify();
});

test("approving when no team is awaiting approval is refused rather than composing nothing", async () => {
  // Anticipate — the Orchestrator asks a question, so no team was ever proposed.
  ctx.engine
    .anticipate({ as: "Orchestrator", persona: /# Role: Orchestrator/ })
    .parks(fenced({ action: "ask_user", question: "Which database?" }), "session");
  const conversation = await startOrchestration();
  await waitForStageStatus(ctx.app, conversation.id, "orchestrate", "asking");

  // Act
  const rejected = await post<{ error: string }>(
    ctx.app,
    `/orchestrations/${conversation.orchestrationId}/approve`,
    { engine: "claude-code" },
  );

  // Assert
  expect(rejected.status).toBe(400);
  expect(rejected.body.error).toContain("No team is awaiting approval");
  ctx.engine.verify();
});

test("a composed run reloads with its definition, so it can be restarted after a server restart", async () => {
  // Anticipate — the composed team fails QA, leaving the run restartable.
  ctx.engine
    .anticipate({ as: "Orchestrator", persona: /# Role: Orchestrator/ })
    .reports(fenced(TEAM_PROPOSAL));
  ctx.engine.anticipate({ as: "Developer" }).reports("Built it.\n\nVERDICT: PASS");
  ctx.engine.anticipate({ as: "QA Engineer" }).reports("Broken.\n\nVERDICT: FAIL");
  const conversation = await proposedTeam();
  const { body: composed } = await post<RunState>(
    ctx.app,
    `/orchestrations/${conversation.orchestrationId}/approve`,
    { engine: "claude-code" },
  );
  await waitForRunStatus(ctx.app, composed.id, "needs_attention");
  await ctx.orchestrator.shutdown();

  // Act
  const restarted = await restartApp();

  // Assert — a composed id is in no constant, so only the frozen definition
  // can answer "which pipeline was this".
  const { body: reloaded } = await get<RunState>(
    restarted.app,
    `/runs/${composed.id}`,
  );
  expect(reloaded.pipeline?.name).toBe("Delivery pair");
  const retried = await post(restarted.app, `/runs/${composed.id}/restart`, {
    stageId: "test",
  });
  expect(retried.status).toBe(200);
  await restarted.shutdown();
});

async function proposedTeam(): Promise<RunState> {
  const conversation = await startOrchestration();
  await waitForRunStatus(ctx.app, conversation.id, "completed");
  return conversation;
}

async function startOrchestration(): Promise<RunState> {
  const { status, body: run } = await post<RunState>(ctx.app, "/orchestrations", {
    goal: "Add search to the product",
    engine: "claude-code",
  });
  expect(status, `POST /orchestrations returned ${JSON.stringify(run)}`).toBe(201);
  return run;
}

function stageMessage(run: RunState): string {
  return run.stages
    .flatMap((stage) => stage.logs.map((entry) => entry.message))
    .join("\n");
}

function fenced(decision: unknown): string {
  return `Here is what I propose.\n\n\`\`\`adhd-orchestrator-decision\n${JSON.stringify(decision)}\n\`\`\``;
}

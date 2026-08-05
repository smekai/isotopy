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
import { OrchestrationRepository } from "../../src/repository/orchestration-repository.ts";

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
  ctx = await createTestApp({ activeOrchestrator: false });
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

test("a project rejects a second active Orchestrator after the first conversation finishes", async () => {
  // Arrange
  ctx.engine
    .anticipate({ as: "first Orchestrator", persona: /# Role: Orchestrator/ })
    .reports(fenced(TEAM_PROPOSAL));
  const first = await startOrchestration();
  await waitForRunStatus(ctx.app, first.id, "completed");

  // Anticipate — none: singleton admission stops before the engine boundary.

  // Act
  const rejected = await post<{ error: string }>(ctx.app, "/orchestrations", {
    goal: "Start another initiative",
    engine: "claude-code",
  });

  // Assert
  expect(rejected.status).toBe(409);
  expect(rejected.body.error).toContain("active Orchestrator");
  ctx.engine.verify();
});

test("a typed stop terminates the Orchestrator while its conversation run finishes normally", async () => {
  // Anticipate
  ctx.engine
    .anticipate({ as: "Orchestrator stop", persona: /# Role: Orchestrator/ })
    .reports(fenced({ action: "stop", reason: "The goal is already complete" }));

  // Act
  const run = await startOrchestration();

  // Assert
  await waitForRunStatus(ctx.app, run.id, "completed");
  const orchestration = ctx.orchestrations.get(run.orchestrationId!);
  expect(orchestration).toMatchObject({
    status: "stopped",
    stopReason: "The goal is already complete",
  });
  expect(orchestration?.stoppedAt).toBeDefined();
  ctx.engine.verify();
});

test("explicit stop aborts the Orchestrator's active composed run and retains its history", async () => {
  // Arrange
  ctx.engine
    .anticipate({ as: "Orchestrator", persona: /# Role: Orchestrator/ })
    .reports(fenced(TEAM_PROPOSAL));
  ctx.engine.anticipate({ as: "Developer" }).hangsUntilAborted();
  const conversation = await proposedTeam();
  const { body: composed } = await post<RunState>(
    ctx.app,
    `/orchestrations/${conversation.orchestrationId}/approve`,
    { engine: "claude-code" },
  );
  await ctx.engine.waitForCall(2);

  // Act
  const { body: stopped } = await post<Orchestration>(
    ctx.app,
    `/orchestrations/${conversation.orchestrationId}/stop`,
  );

  // Assert
  const aborted = await waitForRunStatus(ctx.app, composed.id, "cancelled");
  expect(aborted.status).toBe("cancelled");
  expect(stopped).toMatchObject({
    status: "stopped",
    stopReason: "Stopped by user",
    runIds: [conversation.id, composed.id],
  });
  expect(stopped.approvedTeam).toMatchObject({ name: "Delivery pair" });
  ctx.engine.verify();
});

test("explicit stop is idempotent for an already stopped Orchestrator", async () => {
  // Arrange
  ctx.engine
    .anticipate({ as: "Orchestrator stop", persona: /# Role: Orchestrator/ })
    .reports(fenced({ action: "stop", reason: "Finished" }));
  const run = await startOrchestration();
  await waitForRunStatus(ctx.app, run.id, "completed");
  const before = ctx.orchestrations.get(run.orchestrationId!);

  // Act
  const { body: stopped } = await post<Orchestration>(
    ctx.app,
    `/orchestrations/${run.orchestrationId}/stop`,
  );

  // Assert
  expect(stopped.stoppedAt).toBe(before?.stoppedAt);
  expect(stopped.stopReason).toBe("Finished");
  ctx.engine.verify();
});

test("startup retains the newest legacy Orchestrator and retires older active records", async () => {
  // Arrange
  const repository = new OrchestrationRepository(ctx.registry.resolve());
  await repository.write(orchestrationRecord("older", "2026-08-04T10:00:00.000Z"));
  await repository.write(orchestrationRecord("newer", "2026-08-04T11:00:00.000Z"));
  await repository.settle();

  // Anticipate — none: reconciliation is persistence-only.

  // Act
  const restarted = await restartApp();

  // Assert
  const records = restarted.orchestrations.list(ctx.registry.resolve().id);
  expect(records).toMatchObject([
    {
      id: "older",
      status: "stopped",
      stopReason: "Retired when the project adopted one active Orchestrator",
    },
    { id: "newer", status: "running" },
  ]);
  await restarted.shutdown();
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

test("ordinary work is rejected before run state exists when the project has no Orchestrator", async () => {
  // Anticipate — none: the missing Orchestrator blocks the engine boundary.

  // Act
  const rejected = await post<{ error: string }>(ctx.app, "/runs", {
    pipelineId: "solo",
    task: "Add search to the product",
    engine: "claude-code",
  });

  // Assert
  expect(rejected.status).toBe(409);
  expect(rejected.body.error).toContain("Start an Orchestrator");
  expect(ctx.orchestrator.listRuns(ctx.registry.resolve().id)).toEqual([]);
  ctx.engine.verify();
});

test("ordinary work cannot restart after its Orchestrator stops", async () => {
  // Arrange
  ctx.engine
    .anticipate({ as: "Orchestrator", persona: /# Role: Orchestrator/ })
    .reports(fenced(TEAM_PROPOSAL));
  ctx.engine.anticipate({ as: "Developer" }).fails("engine stopped");
  const conversation = await proposedTeam();
  const { body: composed } = await post<RunState>(
    ctx.app,
    `/orchestrations/${conversation.orchestrationId}/approve`,
    { engine: "claude-code" },
  );
  await waitForRunStatus(ctx.app, composed.id, "failed");
  await post(ctx.app, `/orchestrations/${conversation.orchestrationId}/stop`);

  // Anticipate — none: restart admission fails before the engine boundary.

  // Act
  const rejected = await post<{ error: string }>(
    ctx.app,
    `/runs/${composed.id}/restart`,
    { stageId: "implementation" },
  );

  // Assert
  expect(rejected.status).toBe(409);
  expect(rejected.body.error).toContain("Start an Orchestrator");
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

function orchestrationRecord(id: string, updatedAt: string): Orchestration {
  return {
    id,
    projectId: "home",
    goal: `Goal for ${id}`,
    status: "running",
    turns: [],
    runIds: [],
    createdAt: updatedAt,
    updatedAt,
  };
}

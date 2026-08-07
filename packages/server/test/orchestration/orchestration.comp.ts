import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import type {
  EngineId,
  Orchestration,
  OrchestratorDecision,
  OrchestratorTeamProposal,
  RunState,
} from "@adhd/core";
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
import {
  orchestration,
  seedOrchestration,
} from "../support/orchestration-fixtures.ts";

const DEVELOPER_ROLE: OrchestratorTeamProposal["roles"][number] = {
  id: "implementation",
  label: "Developer",
  skill: "developer",
  stepTask: "implement-feature",
};

const QA_ROLE: OrchestratorTeamProposal["roles"][number] = {
  id: "test",
  label: "QA Engineer",
  skill: "tester",
  stepTask: "verify-feature",
  executionPolicy: "quality",
};

const TEAM: OrchestratorTeamProposal = {
  name: "Delivery pair",
  summary: "Build the search endpoint and verify it",
  roles: [DEVELOPER_ROLE, QA_ROLE],
};

const TEAM_PROPOSAL: OrchestratorDecision = {
  action: "propose_team",
  rationale: "One Developer and one QA Engineer cover this",
  team: TEAM,
};

/** The same pair, but the Developer may stop and ask — only then is a question brokered. */
const INTERACTIVE_TEAM_PROPOSAL: OrchestratorDecision = {
  action: "propose_team",
  rationale: "One Developer and one QA Engineer cover this",
  team: {
    ...TEAM,
    roles: [{ ...DEVELOPER_ROLE, interactive: true }, QA_ROLE],
  },
};

const REVIEW_ARTIFACTS = {
  summary: "The composed team delivered",
  deliveredScope: [],
  decisions: [],
  knowledge: [],
  findings: [],
};

const STOP: OrchestratorDecision = { action: "stop", reason: "goal met" };

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

test("an Orchestrator on a CLI that cannot resume still parks, and continues from the replayed conversation", async () => {
  // Arrange — Cursor's CLI has no session to hand back, so every turn starts cold.
  await ctx.dispose();
  ctx = await createTestApp({ engineId: "cursor" });

  // Anticipate — the second turn must carry the goal, the question, and the answer,
  // because there is no session holding any of them.
  ctx.engine
    .anticipate({ as: "Orchestrator question", persona: /# Role: Orchestrator/ })
    .reports(fenced({ action: "ask_user", question: "Which database?" }));
  ctx.engine
    .anticipate({
      as: "Orchestrator proposal",
      prompt: /^(?=[\s\S]*Add search to the product)(?=[\s\S]*Which database\?)(?=[\s\S]*Postgres)/,
    })
    .reports(fenced(TEAM_PROPOSAL));
  const run = await startOrchestration("cursor");
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

test("a second Orchestrator supersedes the first, so a project is never stuck on one goal", async () => {
  // Arrange
  ctx.engine
    .anticipate({ as: "first Orchestrator", persona: /# Role: Orchestrator/ })
    .reports(fenced(TEAM_PROPOSAL));
  const first = await startOrchestration();
  await waitForRunStatus(ctx.app, first.id, "completed");

  // Anticipate
  ctx.engine
    .anticipate({ as: "second Orchestrator", persona: /# Role: Orchestrator/ })
    .reports(fenced(TEAM_PROPOSAL));

  // Act
  const { status, body: second } = await post<RunState>(ctx.app, "/orchestrations", {
    goal: "Start another initiative",
    engine: "claude-code",
  });

  // Assert
  expect(status).toBe(201);
  await waitForRunStatus(ctx.app, second.id, "completed");
  expect(ctx.orchestrations.get(first.orchestrationId!)).toMatchObject({
    status: "stopped",
    stopReason: "Superseded by a new Orchestrator",
  });
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
  const projectId = ctx.registry.resolve().id;
  await seedOrchestration(
    ctx.registry,
    orchestration({ id: "older", projectId, updatedAt: "2026-08-04T10:00:00.000Z" }),
  );
  await seedOrchestration(
    ctx.registry,
    orchestration({ id: "newer", projectId, updatedAt: "2026-08-04T11:00:00.000Z" }),
  );

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

test("ordinary work bootstraps its own Orchestrator, so a fresh project is never deadlocked", async () => {
  // Anticipate
  ctx.engine.anticipate({ as: "Developer" }).reports("done");
  ctx.engine.anticipateRunReview();

  // Act
  const run = await startRun(ctx.app, {
    pipelineId: "solo",
    task: "Add search to the product",
    engine: "claude-code",
  });

  // Assert — the bootstrapped Orchestrator owns the run, reviews it when it
  // settles, and stops because its own review asked for nothing further.
  await waitForRunStatus(ctx.app, run.id, "completed");
  expect(ctx.orchestrations.list(ctx.registry.resolve().id)).toMatchObject([
    {
      id: run.orchestrationId,
      goal: "Add search to the product",
      status: "stopped",
      runIds: [run.id],
      turns: [{ runId: run.id, decision: { action: "stop" } }],
    },
  ]);
  ctx.engine.verify();
});

test("restarting work whose Orchestrator stopped adopts it into the current one", async () => {
  // Arrange
  ctx.engine
    .anticipate({ as: "Orchestrator", persona: /# Role: Orchestrator/ })
    .reports(fenced(TEAM_PROPOSAL));
  ctx.engine.anticipate({ as: "Developer" }).fails("engine stopped");
  // The review parks rather than stopping, so the user's own stop is what ends it.
  ctx.engine.anticipateRunReview({
    as: "review of the failed run",
    decision: { action: "ask_user", question: "Should I retry the Developer?" },
  });
  const conversation = await proposedTeam();
  const { body: composed } = await post<RunState>(
    ctx.app,
    `/orchestrations/${conversation.orchestrationId}/approve`,
    { engine: "claude-code" },
  );
  await waitForRunStatus(ctx.app, composed.id, "failed");
  await post(ctx.app, `/orchestrations/${conversation.orchestrationId}/stop`);

  // Anticipate
  ctx.engine.anticipate({ as: "restarted Developer" }).reports("done");
  ctx.engine.anticipate({ as: "QA Engineer" }).reports("PASS — verified");
  ctx.engine.anticipateRunReview({ as: "review of the restarted run" });

  // Act
  const { status, body: restarted } = await post<RunState>(
    ctx.app,
    `/runs/${composed.id}/restart`,
    { stageId: "implementation" },
  );

  // Assert
  expect(status).toBe(200);
  expect(restarted.orchestrationId).not.toBe(conversation.orchestrationId);
  await waitForRunStatus(ctx.app, composed.id, "completed");
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
  ctx.engine.anticipateRunReview();
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

test("approving records the team and keeps both runs on the orchestration", async () => {
  // Anticipate
  ctx.engine
    .anticipate({ as: "Orchestrator", persona: /# Role: Orchestrator/ })
    .reports(fenced(TEAM_PROPOSAL));
  ctx.engine.anticipate({ as: "Developer" }).reports("Built it.\n\nVERDICT: PASS");
  ctx.engine.anticipate({ as: "QA Engineer" }).reports("Checked it.\n\nVERDICT: PASS");
  ctx.engine.anticipateRunReview({
    decision: { action: "ask_user", question: "Ship it now?" },
  });
  const conversation = await proposedTeam();

  // Act
  const { body: composed } = await post<RunState>(
    ctx.app,
    `/orchestrations/${conversation.orchestrationId}/approve`,
    { engine: "claude-code" },
  );

  // Assert — both runs belong to the orchestration, in the order they happened,
  // and the post-run review is what moved it off running.
  await waitForRunStatus(ctx.app, composed.id, "completed");
  const { body: orchestration } = await get<Orchestration>(
    ctx.app,
    `/orchestrations/${conversation.orchestrationId}`,
  );
  expect(orchestration).toMatchObject({
    status: "awaiting_user",
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

test("a composed run's review records its artifacts and its own orchestration turn", async () => {
  // Anticipate — a composed team with no closeout stage still produces artifacts.
  ctx.engine
    .anticipate({ as: "Orchestrator", persona: /# Role: Orchestrator/ })
    .reports(fenced(TEAM_PROPOSAL));
  ctx.engine.anticipate({ as: "Developer" }).reports("Built it.\n\nVERDICT: PASS");
  ctx.engine.anticipate({ as: "QA Engineer" }).reports("Checked it.\n\nVERDICT: PASS");
  ctx.engine
    .anticipate({
      as: "Orchestrator review",
      persona: /# Role: Orchestrator/,
      prompt: /# Assignment: Review a settled run/,
    })
    .reports(
      `${artifactsBlock({
        summary: "Search endpoint shipped",
        deliveredScope: ["Search endpoint"],
        decisions: ["Postgres full-text search"],
        knowledge: ["The seed script needs the extension installed first"],
        findings: [],
        nextRecommendation: "Warm the index on startup",
      })}\n\n${fenced({ action: "ask_user", question: "Ship it now?" })}`,
    );
  const conversation = await proposedTeam();

  // Act
  const { body: composed } = await post<RunState>(
    ctx.app,
    `/orchestrations/${conversation.orchestrationId}/approve`,
    { engine: "claude-code" },
  );

  // Assert
  const finished = await waitForRunStatus(ctx.app, composed.id, "completed");
  expect(finished.artifacts?.report).toMatchObject({
    knowledge: ["The seed script needs the extension installed first"],
    nextRecommendation: "Warm the index on startup",
  });
  // The record outlives the process, alongside the run's per-stage handoffs.
  expect(await readArtifacts(ctx.home, composed.id)).toContain(
    "# Orchestrator run artifacts",
  );
  const { body: orchestration } = await get<Orchestration>(
    ctx.app,
    `/orchestrations/${conversation.orchestrationId}`,
  );
  expect(orchestration.turns.at(-1)).toMatchObject({
    runId: composed.id,
    decision: { action: "ask_user" },
  });
  ctx.engine.verify();
});

test("the review is handed the settled run's stage outputs, not its raw task alone", async () => {
  // Anticipate
  ctx.engine
    .anticipate({ as: "Orchestrator", persona: /# Role: Orchestrator/ })
    .reports(fenced(TEAM_PROPOSAL));
  ctx.engine.anticipate({ as: "Developer" }).reports("MARKER-DEVELOPER built it.");
  ctx.engine.anticipate({ as: "QA Engineer" }).reports("MARKER-QA checked it.");
  ctx.engine
    .anticipate({ as: "Orchestrator review", prompt: /MARKER-DEVELOPER[\s\S]*MARKER-QA/ })
    .reports(`${artifactsBlock(REVIEW_ARTIFACTS)}\n\n${fenced(STOP)}`);
  const conversation = await proposedTeam();

  // Act
  const { body: composed } = await post<RunState>(
    ctx.app,
    `/orchestrations/${conversation.orchestrationId}/approve`,
    { engine: "claude-code" },
  );

  // Assert
  await waitForRunStatus(ctx.app, composed.id, "completed");
  ctx.engine.verify();
});

test("a start_run review launches the next run only once the first freed the project", async () => {
  // Anticipate — the second composed run proves the admission claim was released
  // before the review's decision was acted on.
  ctx.engine
    .anticipate({ as: "Orchestrator", persona: /# Role: Orchestrator/ })
    .reports(fenced(TEAM_PROPOSAL));
  ctx.engine.anticipate({ as: "Developer" }).reports("Built it.\n\nVERDICT: PASS");
  ctx.engine.anticipate({ as: "QA Engineer" }).reports("Checked it.\n\nVERDICT: PASS");
  ctx.engine.anticipateRunReview({
    as: "review asking for a second run",
    decision: {
      action: "start_run",
      rationale: "The index still needs warming",
      task: "Warm the search index on startup",
    },
  });
  ctx.engine
    .anticipate({ as: "second Developer", prompt: /Warm the search index/ })
    .reports("Warmed it.\n\nVERDICT: PASS");
  ctx.engine.anticipate({ as: "second QA Engineer" }).reports("Checked it.\n\nVERDICT: PASS");
  ctx.engine.anticipateRunReview({ as: "review of the second run" });
  const conversation = await proposedTeam();

  // Act
  const { body: composed } = await post<RunState>(
    ctx.app,
    `/orchestrations/${conversation.orchestrationId}/approve`,
    { engine: "claude-code" },
  );
  await waitForRunStatus(ctx.app, composed.id, "completed");

  // Assert — three runs on the orchestration: conversation, composed, and the
  // one the review started. The second reuses the approved team's pipeline.
  const second = await waitForOrchestrationRuns(
    conversation.orchestrationId ?? "",
    3,
  );
  expect(second).not.toBe(composed.id);
  const { body: latest } = await get<RunState>(ctx.app, `/runs/${second}`);
  expect(latest).toMatchObject({
    pipelineId: `team-${conversation.orchestrationId}`,
    task: "Warm the search index on startup",
    orchestrationId: conversation.orchestrationId,
  });
  await waitForRunStatus(ctx.app, second, "completed");
  ctx.engine.verify();
});

test("a start_run review with no approved team records the error instead of launching", async () => {
  // Anticipate — nothing was ever approved, so there is no pipeline to reuse.
  ctx.engine.anticipate({ as: "Developer" }).reports("done");
  ctx.engine.anticipateRunReview({
    decision: {
      action: "start_run",
      rationale: "There is more to do",
      task: "Do the rest",
    },
  });

  // Act
  const run = await startRun(ctx.app, {
    pipelineId: "solo",
    task: "Add search to the product",
    engine: "claude-code",
  });

  // Assert
  await waitForRunStatus(ctx.app, run.id, "completed");
  const orchestrationId = run.orchestrationId ?? "";
  const { body: orchestration } = await get<Orchestration>(
    ctx.app,
    `/orchestrations/${orchestrationId}`,
  );
  expect(orchestration.decisionError).toContain("before a team was approved");
  expect(orchestration.runIds).toEqual([run.id]);
  ctx.engine.verify();
});

test("a malformed review leaves the run terminal and records why it was unusable", async () => {
  // Anticipate — the Orchestrator answers with prose and no blocks at all.
  ctx.engine.anticipate({ as: "Developer" }).reports("done");
  ctx.engine
    .anticipate({ as: "Orchestrator review" })
    .reports("Looks fine to me, nothing structured to add.");

  // Act
  const run = await startRun(ctx.app, {
    pipelineId: "solo",
    task: "Add search to the product",
    engine: "claude-code",
  });

  // Assert — the run's own work stands; only the review is lost.
  const finished = await waitForRunStatus(ctx.app, run.id, "completed");
  expect(finished.artifacts).toBeUndefined();
  const { body: orchestration } = await get<Orchestration>(
    ctx.app,
    `/orchestrations/${run.orchestrationId}`,
  );
  expect(orchestration.decisionError).toContain("adhd-run-artifacts");
  expect(orchestration.decisionError).toContain("adhd-orchestrator-decision");
  expect(orchestration.turns).toEqual([]);
  ctx.engine.verify();
});

test("a review turn survives a server restart without appending a second turn", async () => {
  // Anticipate
  ctx.engine.anticipate({ as: "Developer" }).reports("done");
  ctx.engine.anticipateRunReview({
    decision: { action: "ask_user", question: "Anything else?" },
  });
  const run = await startRun(ctx.app, {
    pipelineId: "solo",
    task: "Add search to the product",
    engine: "claude-code",
  });
  await waitForRunStatus(ctx.app, run.id, "completed");
  await ctx.orchestrator.shutdown();

  // Act
  const restarted = await restartApp();

  // Assert
  const { body: orchestration } = await get<Orchestration>(
    restarted.app,
    `/orchestrations/${run.orchestrationId}`,
  );
  expect(orchestration.turns).toHaveLength(1);
  expect(orchestration.status).toBe("awaiting_user");
  await restarted.shutdown();
});

test("a later question is brokered against the prior run's digest, not its raw output", async () => {
  // Anticipate — run one's stage output is bulky; its review condenses it, and
  // that condensation is what the next run's mediation turn is handed.
  ctx.engine
    .anticipate({ as: "Orchestrator", persona: /# Role: Orchestrator/ })
    .reports(fenced(INTERACTIVE_TEAM_PROPOSAL));
  ctx.engine.anticipate({ as: "Developer" }).reports("MARKER-RAW-DEVELOPER-OUTPUT");
  ctx.engine.anticipate({ as: "QA Engineer" }).reports("MARKER-RAW-QA-OUTPUT");
  ctx.engine.anticipateRunReview({
    as: "review of the first run",
    artifacts: { summary: "MARKER-CONDENSED-SUMMARY" },
    decision: {
      action: "start_run",
      rationale: "One more pass is needed",
      task: "Warm the search index",
    },
  });
  ctx.engine.anticipate({ as: "second Developer" }).asks("Which index?", "second-session");
  ctx.engine
    .anticipate({
      as: "Orchestrator mediation",
      // The digest is present and the first run's raw output is not.
      prompt: /^(?![\s\S]*MARKER-RAW-DEVELOPER-OUTPUT)[\s\S]*MARKER-CONDENSED-SUMMARY/,
    })
    .reports(
      fenced({
        action: "answer_agent",
        answer: "The search index.",
        rationale: "Named in the run task",
      }),
    );
  ctx.engine
    .anticipate({ as: "resumed second Developer", resumeSessionId: "second-session" })
    .reports("Warmed it.\n\nVERDICT: PASS");
  ctx.engine.anticipate({ as: "second QA Engineer" }).reports("Checked.\n\nVERDICT: PASS");
  ctx.engine.anticipateRunReview({ as: "review of the second run" });
  const conversation = await proposedTeam();

  // Act
  const { body: composed } = await post<RunState>(
    ctx.app,
    `/orchestrations/${conversation.orchestrationId}/approve`,
    { engine: "claude-code" },
  );
  await waitForRunStatus(ctx.app, composed.id, "completed");

  // Assert — the mediation prompt matcher above carries both halves of the
  // claim; verify() is what enforces it once the second run has finished.
  const second = await waitForOrchestrationRuns(
    conversation.orchestrationId ?? "",
    3,
  );
  await waitForRunStatus(ctx.app, second, "completed");
  ctx.engine.verify();
}, 20_000);

async function waitForOrchestrationRuns(
  orchestrationId: string,
  count: number,
): Promise<string> {
  const deadline = Date.now() + 10_000;
  let runIds: string[] = [];
  while (runIds.length < count && Date.now() < deadline) {
    const { body } = await get<Orchestration>(
      ctx.app,
      `/orchestrations/${orchestrationId}`,
    );
    runIds = body.runIds;
    if (runIds.length < count) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  const last = runIds.at(-1);
  expect(
    runIds.length,
    `Orchestration ${orchestrationId} had runs ${runIds.join(", ")}`,
  ).toBe(count);
  return last ?? "";
}

async function proposedTeam(): Promise<RunState> {
  const conversation = await startOrchestration();
  await waitForRunStatus(ctx.app, conversation.id, "completed");
  return conversation;
}

async function startOrchestration(engine: EngineId = "claude-code"): Promise<RunState> {
  const { status, body: run } = await post<RunState>(ctx.app, "/orchestrations", {
    goal: "Add search to the product",
    engine,
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

function readArtifacts(home: string, runId: string): Promise<string> {
  return readFile(path.join(home, "runs", runId, "artifacts", "artifacts.md"), "utf8");
}

function artifactsBlock(report: unknown): string {
  return `\`\`\`adhd-run-artifacts\n${JSON.stringify(report)}\n\`\`\``;
}


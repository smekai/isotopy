import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import type { Orchestration, OrchestratorDecision, RunState, TeamDefinition } from "@isotopy/core";
import {
  createTestApp,
  get,
  post,
  restartApp,
  stageMessage,
  stageOf,
  startOrchestration,
  startRun,
  teamRunOf,
  waitForOrchestration,
  waitForOrchestrationRun,
  waitForRunStatus,
  waitForStageStatus,
} from "../support/harness.ts";
import { toPosixPath } from "../../src/utils/posix-path.ts";
import type { TestApp } from "../support/harness.ts";
import {
  DEVELOPER_ROLE,
  fenced,
  orchestration,
  PAIR_TEAM,
  QA_ROLE,
  seedOrchestration,
  START_PAIR,
  TEAM_CHANGE,
  teamFileText,
  writeTeam,
} from "../support/orchestration-fixtures.ts";

const CUT_OFF_SESSION = "d0280d10-d76c-4703-a0ce-0ab42acdc2be";

const DEVELOPER_SESSION = "2aa7153f-d094-44c2-bec1-92fc7e4307e2";

const REVIEW_SESSION = "6c1f0e52-3a8d-4f57-9b0e-5d2c7a9e41b3";

/** The Developer is where the thinking happens; QA is left on whatever the run chose. */
const TIERED_TEAM: TeamDefinition = {
  ...PAIR_TEAM,
  roster: [{ ...DEVELOPER_ROLE, modelTier: "deep" }, QA_ROLE],
};

/** The same pair, but the Developer may stop and ask — only then is a question brokered. */
const INTERACTIVE_TEAM: TeamDefinition = {
  ...PAIR_TEAM,
  roster: [{ ...DEVELOPER_ROLE, interactive: true }, QA_ROLE],
};

const REVIEW_ARTIFACTS = {
  summary: "The composed team delivered",
  deliveredScope: [],
  decisions: [],
  knowledge: [],
  findings: [],
};

const STOP: OrchestratorDecision = { action: "stop", reason: "goal met" };

/** The verbatim dead end from TASK-139 — a policy the model invented, rejected whole. */
const INVENTED_POLICY_CHANGE = {
  action: "propose_team_change",
  rationale: "QA should only test",
  team: teamFileText({ ...PAIR_TEAM, roster: [DEVELOPER_ROLE, { ...QA_ROLE, executionPolicy: "testing" }] } as TeamDefinition),
};

/** The same roles, but in `audit` the Developer's role takes a review step instead of building. */
const AUDIT_TEAM: TeamDefinition = {
  ...PAIR_TEAM,
  flows: {
    ...PAIR_TEAM.flows,
    audit: [
      { role: "implementation", step: "review-implementation" },
      { role: "test", step: "verify-feature" },
    ],
  },
};

/** One role, so a spinning loop costs two engine turns a run instead of three. */
const SOLO_TEAM: TeamDefinition = {
  roster: [DEVELOPER_ROLE],
  flows: { pair: [{ role: "implementation", step: "implement-feature" }] },
};

const BLOCKED_REPORT = "No browser was available, so nothing was verified.\n\nVERDICT: FAIL";

const RETRY: OrchestratorDecision = {
  action: "start_run",
  rationale: "Try the verification again",
  flow: "pair",
  task: "Verify the search endpoint",
};

/** The verbatim trigger from TASK-061, reused here to park a composed stage. */
const SESSION_LIMIT = "You've hit your session limit · resets 4:30pm (Europe/Tallinn)";

let ctx: TestApp;

beforeEach(async () => {
  ctx = await createTestApp();
  await writeTeam(ctx.home);
});

afterEach(async () => {
  await ctx.dispose();
});

test("the Orchestrator's own conversation is not given a team's working rules, because it changes no files", async () => {
  // Anticipate
  ctx.engine
    .anticipate({ as: "Orchestrator", persona: /# Role: Orchestrator/ })
    .hangsUntilAborted();

  // Act
  const conversation = await startOrchestration(ctx.app);

  // Assert
  const call = await ctx.engine.waitForCall(1);
  expect(call.prompt).not.toContain(
    toPosixPath(path.join(ctx.home, "runs", conversation.id, "artifacts")),
  );
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
  const run = await startOrchestration(ctx.app);

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

test("an escalate_to_user decision parks the Orchestrator on the user just as ask_user does", async () => {
  // Anticipate
  ctx.engine
    .anticipate({ as: "Orchestrator escalation", persona: /# Role: Orchestrator/ })
    .reports(fenced({ action: "escalate_to_user", question: "Which database?", originStageId: "orchestrate" }));

  // Act
  const run = await startOrchestration(ctx.app);

  // Assert
  await waitForStageStatus(ctx.app, run.id, "orchestrate", "asking");
  const { body: parked } = await get<Orchestration>(
    ctx.app,
    `/orchestrations/${run.orchestrationId}`,
  );
  expect(parked.status).toBe("awaiting_user");
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
    .reports(fenced(TEAM_CHANGE));

  // Arrange
  const run = await startOrchestration(ctx.app);
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
    latestDecision: { action: "propose_team_change" },
  });
  expect(orchestration.turns.map((turn) => turn.decision.action)).toEqual([
    "ask_user",
    "propose_team_change",
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
    .reports(fenced(TEAM_CHANGE));
  const run = await startOrchestration(ctx.app, {}, "cursor");
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
    latestDecision: { action: "propose_team_change" },
  });
  expect(orchestration.turns.map((turn) => turn.decision.action)).toEqual([
    "ask_user",
    "propose_team_change",
  ]);
  ctx.engine.verify();
});

test("a start_run runs a flow of the standing team at once, and nobody is asked to approve it", async () => {
  // Anticipate
  ctx.engine
    .anticipate({ as: "Orchestrator", persona: /# Role: Orchestrator/, prompt: /flows:[\s\S]*pair:/ })
    .reports(fenced(START_PAIR));
  ctx.engine.anticipate({ as: "Developer", prompt: /Build the search endpoint/ }).reports("Built it.\n\nVERDICT: PASS");
  ctx.engine.anticipate({ as: "QA Engineer" }).reports("Checked it.\n\nVERDICT: PASS");
  ctx.engine.anticipateRunReview();

  // Act
  const conversation = await startOrchestration(ctx.app);

  // Assert
  const composed = await teamRunOf(ctx.app, conversation);
  const finished = await waitForRunStatus(ctx.app, composed.id, "completed");
  expect(finished.pipelineId).toBe("flow-pair");
  ctx.engine.verify();
});

test("a second Orchestrator supersedes the first, so a project is never stuck on one goal", async () => {
  // Arrange
  ctx.engine
    .anticipate({ as: "first Orchestrator", persona: /# Role: Orchestrator/ })
    .reports(fenced(TEAM_CHANGE));
  const first = await startOrchestration(ctx.app);
  await waitForRunStatus(ctx.app, first.id, "completed");

  // Anticipate
  ctx.engine
    .anticipate({ as: "second Orchestrator", persona: /# Role: Orchestrator/ })
    .reports(fenced(TEAM_CHANGE));

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
  const run = await startOrchestration(ctx.app);

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
    .reports(fenced(START_PAIR));
  ctx.engine.anticipate({ as: "Developer" }).hangsUntilAborted();
  const conversation = await startOrchestration(ctx.app);
  const composed = await teamRunOf(ctx.app, conversation);
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
  ctx.engine.verify();
});

test("explicit stop is idempotent for an already stopped Orchestrator", async () => {
  // Arrange
  ctx.engine
    .anticipate({ as: "Orchestrator stop", persona: /# Role: Orchestrator/ })
    .reports(fenced({ action: "stop", reason: "Finished" }));
  const run = await startOrchestration(ctx.app);
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
  const run = await startOrchestration(ctx.app);

  // Assert
  const finished = await waitForRunStatus(ctx.app, run.id, "needs_attention");
  const { body: orchestration } = await get<Orchestration>(
    ctx.app,
    `/orchestrations/${run.orchestrationId}`,
  );
  expect(stageMessage(finished)).toContain("no usable decision");
  // Not `conversing`: nothing is thinking, and the next move is the owner's.
  expect(orchestration).toMatchObject({ status: "awaiting_user", turns: [] });
  expect(orchestration.decisionError).toContain(
    "Missing fenced isotopy-orchestrator-decision JSON block",
  );
  ctx.engine.verify();
});

test("a decision carrying an unknown field is rejected whole, not stripped down to what fits", async () => {
  // Anticipate
  ctx.engine
    .anticipate({ as: "Orchestrator", persona: /# Role: Orchestrator/ })
    .reports(fenced({ action: "stop", reason: "goal met", confidence: 0.9 }));

  // Act
  const run = await startOrchestration(ctx.app);

  // Assert
  await waitForRunStatus(ctx.app, run.id, "needs_attention");
  const { body: orchestration } = await get<Orchestration>(
    ctx.app,
    `/orchestrations/${run.orchestrationId}`,
  );
  expect(orchestration).toMatchObject({ status: "awaiting_user", turns: [] });
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
    .reports(fenced(START_PAIR));
  ctx.engine.anticipate({ as: "Developer" }).fails("engine stopped");
  // The review parks rather than stopping, so the user's own stop is what ends it.
  ctx.engine.anticipateRunReview({
    as: "review of the failed run",
    decision: { action: "ask_user", question: "Should I retry the Developer?" },
  });
  const conversation = await startOrchestration(ctx.app);
  const composed = await teamRunOf(ctx.app, conversation);
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
  const run = await startOrchestration(ctx.app);
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

test("a flow's run carries its own pipeline definition, since no constant resolves it", async () => {
  // Anticipate — the Orchestrator starts the pair flow, which then runs.
  ctx.engine
    .anticipate({ as: "Orchestrator", persona: /# Role: Orchestrator/ })
    .reports(fenced(START_PAIR));
  ctx.engine.anticipate({ as: "Developer" }).reports("Built it.\n\nVERDICT: PASS");
  ctx.engine.anticipate({ as: "QA Engineer" }).reports("Checked it.\n\nVERDICT: PASS");
  ctx.engine.anticipateRunReview();

  // Act
  const conversation = await startOrchestration(ctx.app);
  const composed = await teamRunOf(ctx.app, conversation);

  // Assert — the definition travels on the run, since no constant can resolve it.
  const finished = await waitForRunStatus(ctx.app, composed.id, "completed");
  expect(finished.pipelineId).toBe("flow-pair");
  expect(finished.pipeline?.groups[0]?.stages).toMatchObject([
    { id: "implementation", executionPolicy: "standard" },
    { id: "test", executionPolicy: "quality" },
  ]);
  ctx.engine.verify();
});

test("a role with its own preset runs at it while a role without one follows the run's", async () => {
  // Arrange
  await writeTeam(ctx.home, TIERED_TEAM);

  // Anticipate — deep resolves to opus/high for this engine, the run's fast to haiku/medium.
  ctx.engine
    .anticipate({ as: "Orchestrator", persona: /# Role: Orchestrator/ })
    .reports(fenced(START_PAIR));
  ctx.engine
    .anticipate({ as: "Developer", model: "opus", effort: "high" })
    .reports("Built it.\n\nVERDICT: PASS");
  ctx.engine
    .anticipate({ as: "QA Engineer", model: "haiku", effort: "medium" })
    .reports("Checked it.\n\nVERDICT: PASS");
  ctx.engine.anticipateRunReview();

  // Act
  const { body: conversation } = await post<RunState>(ctx.app, "/orchestrations", {
    goal: "Add search to the product",
    engine: "claude-code",
    modelTier: "fast",
  });

  // Assert
  const composed = await teamRunOf(ctx.app, conversation);
  await waitForRunStatus(ctx.app, composed.id, "completed");
  ctx.engine.verify();
});

test("dropping a tier at a limit reaches the blocked role, not only the run default", async () => {
  // Arrange
  await writeTeam(ctx.home, TIERED_TEAM);

  // Anticipate — the Developer is pinned to deep, so lowering only the run's tier
  // would resume it on opus again and block on the same limit.
  ctx.engine
    .anticipate({ as: "Orchestrator", persona: /# Role: Orchestrator/ })
    .reports(fenced(START_PAIR));
  ctx.engine.anticipate({ as: "Developer", model: "opus" }).hitsLimit(SESSION_LIMIT);
  ctx.engine
    .anticipate({ as: "Developer on Haiku", model: "haiku" })
    .reports("Built it.\n\nVERDICT: PASS");
  ctx.engine
    .anticipate({ as: "QA Engineer", model: "haiku" })
    .reports("Checked it.\n\nVERDICT: PASS");
  ctx.engine.anticipateRunReview();
  const { body: conversation } = await post<RunState>(ctx.app, "/orchestrations", {
    goal: "Add search to the product",
    engine: "claude-code",
    modelTier: "balanced",
  });
  const composed = await teamRunOf(ctx.app, conversation);
  await waitForStageStatus(ctx.app, composed.id, "implementation", "blocked");

  // Act
  await post(ctx.app, `/runs/${composed.id}/limit/implementation/resolve`, {
    choice: "switch-tier",
    tier: "fast",
  });

  // Assert
  const finished = await waitForRunStatus(ctx.app, composed.id, "completed");
  expect(stageOf(finished, "implementation").modelTier).toBe("fast");
  ctx.engine.verify();
});

test("a team run and the conversation that started it both belong to the orchestration", async () => {
  // Anticipate
  ctx.engine
    .anticipate({ as: "Orchestrator", persona: /# Role: Orchestrator/ })
    .reports(fenced(START_PAIR));
  ctx.engine.anticipate({ as: "Developer" }).reports("Built it.\n\nVERDICT: PASS");
  ctx.engine.anticipate({ as: "QA Engineer" }).reports("Checked it.\n\nVERDICT: PASS");
  ctx.engine.anticipateRunReview({
    decision: { action: "ask_user", question: "Ship it now?" },
  });

  // Act
  const conversation = await startOrchestration(ctx.app);
  const composed = await teamRunOf(ctx.app, conversation);

  // Assert — both runs belong to the orchestration, in the order they happened,
  // and the post-run review is what moved it off running.
  await waitForRunStatus(ctx.app, composed.id, "completed");
  const { body: orchestration } = await get<Orchestration>(
    ctx.app,
    `/orchestrations/${conversation.orchestrationId}`,
  );
  expect(orchestration).toMatchObject({
    status: "awaiting_user",
    runIds: [conversation.id, composed.id],
  });
  ctx.engine.verify();
});

test("approving when no team change is awaiting approval is refused rather than rewriting the team", async () => {
  // Anticipate — the Orchestrator asks a question, so no change was ever proposed.
  ctx.engine
    .anticipate({ as: "Orchestrator", persona: /# Role: Orchestrator/ })
    .parks(fenced({ action: "ask_user", question: "Which database?" }), "session");
  const conversation = await startOrchestration(ctx.app);
  await waitForStageStatus(ctx.app, conversation.id, "orchestrate", "asking");

  // Act
  const rejected = await post<{ error: string }>(
    ctx.app,
    `/orchestrations/${conversation.orchestrationId}/approve`,
    { engine: "claude-code" },
  );

  // Assert
  expect(rejected.status).toBe(400);
  expect(rejected.body.error).toContain("No team change is awaiting approval");
  ctx.engine.verify();
});

test("a composed run reloads with its definition, so it can be restarted after a server restart", async () => {
  // Anticipate — the composed team fails QA, leaving the run restartable.
  ctx.engine
    .anticipate({ as: "Orchestrator", persona: /# Role: Orchestrator/ })
    .reports(fenced(START_PAIR));
  ctx.engine.anticipate({ as: "Developer" }).reports("Built it.\n\nVERDICT: PASS");
  ctx.engine.anticipate({ as: "QA Engineer" }).reports("Broken.\n\nVERDICT: FAIL");
  const conversation = await startOrchestration(ctx.app);
  const composed = await teamRunOf(ctx.app, conversation);
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
  expect(reloaded.pipeline?.id).toBe("flow-pair");
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
    .reports(fenced(START_PAIR));
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

  // Act
  const conversation = await startOrchestration(ctx.app);
  const composed = await teamRunOf(ctx.app, conversation);

  // Assert
  const finished = await waitForRunStatus(ctx.app, composed.id, "completed");
  expect(finished.closeout?.report).toMatchObject({
    knowledge: ["The seed script needs the extension installed first"],
    nextRecommendation: "Warm the index on startup",
  });
  // The record outlives the process, alongside the run's per-stage handoffs.
  expect(await readCloseout(ctx.home, composed.id)).toContain(
    "# Run closeout",
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
    .reports(fenced(START_PAIR));
  ctx.engine.anticipate({ as: "Developer" }).reports("MARKER-DEVELOPER built it.");
  ctx.engine.anticipate({ as: "QA Engineer" }).reports("MARKER-QA checked it.");
  ctx.engine
    .anticipate({ as: "Orchestrator review", prompt: /MARKER-DEVELOPER[\s\S]*MARKER-QA/ })
    .reports(`${artifactsBlock(REVIEW_ARTIFACTS)}\n\n${fenced(STOP)}`);

  // Act
  const conversation = await startOrchestration(ctx.app);
  const composed = await teamRunOf(ctx.app, conversation);

  // Assert
  await waitForRunStatus(ctx.app, composed.id, "completed");
  ctx.engine.verify();
});

test("a start_run review launches the next run only once the first freed the project", async () => {
  // Anticipate — the second composed run proves the admission claim was released
  // before the review's decision was acted on.
  ctx.engine
    .anticipate({ as: "Orchestrator", persona: /# Role: Orchestrator/ })
    .reports(fenced(START_PAIR));
  ctx.engine.anticipate({ as: "Developer" }).reports("Built it.\n\nVERDICT: PASS");
  ctx.engine.anticipate({ as: "QA Engineer" }).reports("Checked it.\n\nVERDICT: PASS");
  ctx.engine.anticipateRunReview({
    as: "review asking for a second run",
    decision: {
      action: "start_run",
      rationale: "The index still needs warming",
      flow: "pair",
      task: "Warm the search index on startup",
    },
  });
  ctx.engine
    .anticipate({ as: "second Developer", prompt: /Warm the search index/ })
    .reports("Warmed it.\n\nVERDICT: PASS");
  ctx.engine.anticipate({ as: "second QA Engineer" }).reports("Checked it.\n\nVERDICT: PASS");
  ctx.engine.anticipateRunReview({ as: "review of the second run" });

  // Act
  const conversation = await startOrchestration(ctx.app);
  const composed = await teamRunOf(ctx.app, conversation);
  await waitForRunStatus(ctx.app, composed.id, "completed");

  // Assert — three runs on the orchestration: conversation, composed, and the
  // one the review started. The second runs the same flow's pipeline.
  const second = await waitForOrchestrationRun(
    ctx.app,
    conversation.orchestrationId ?? "",
    3,
  );
  expect(second).not.toBe(composed.id);
  const { body: latest } = await get<RunState>(ctx.app, `/runs/${second}`);
  expect(latest).toMatchObject({
    pipelineId: "flow-pair",
    task: "Warm the search index on startup",
    orchestrationId: conversation.orchestrationId,
  });
  await waitForRunStatus(ctx.app, second, "completed");
  ctx.engine.verify();
});

test("a start_run naming a flow the team lacks records the error instead of launching", async () => {
  // Anticipate — team.md has only the pair flow.
  ctx.engine.anticipate({ as: "Developer" }).reports("done");
  ctx.engine.anticipateRunReview({
    decision: {
      action: "start_run",
      rationale: "There is more to do",
      flow: "launch",
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
  expect(orchestration.decisionError).toContain("no flow called launch");
  expect(orchestration.runIds).toEqual([run.id]);
  ctx.engine.verify();
});

// Initiative bdd1c288 parked on its owner over a review whose prose plainly said
// "starting another run from implementation" but carried no decision block.
test("a review missing its decision block is repaired in its own session, so the initiative goes on without its owner", async () => {
  // Anticipate
  ctx.engine.anticipate({ as: "Developer" }).reports("done");
  ctx.engine
    .anticipate({ as: "Orchestrator review" })
    .parks(
      `${artifactsBlock(REVIEW_ARTIFACTS)}\n\nThe goal is met, so I am stopping here.`,
      REVIEW_SESSION,
    );
  ctx.engine
    .anticipate({
      as: "repair asking for the missing block alone",
      resumeSessionId: REVIEW_SESSION,
      prompt: /Missing fenced isotopy-orchestrator-decision JSON block/,
    })
    .reports(fenced(STOP));

  // Act
  const run = await startRun(ctx.app, {
    pipelineId: "solo",
    task: "Add search to the product",
    engine: "claude-code",
  });

  // Assert
  const finished = await waitForRunStatus(ctx.app, run.id, "completed");
  expect(finished.closeout?.report.summary).toBe(REVIEW_ARTIFACTS.summary);
  const stopped = await waitForOrchestration(
    ctx.app,
    run.orchestrationId ?? "",
    ({ status }) => status === "stopped",
  );
  expect(stopped.turns).toMatchObject([{ runId: run.id, decision: STOP }]);
  expect(stopped.decisionError).toBeUndefined();
  ctx.engine.verify();
});

test("a review on a CLI that cannot resume is repaired from a replay of its own assignment and answer", async () => {
  // Anticipate
  ctx.engine.anticipate({ as: "Developer" }).reports("done");
  ctx.engine
    .anticipate({ as: "Orchestrator review" })
    .reports(`${artifactsBlock(REVIEW_ARTIFACTS)}\n\nMARKER-PROSE: the goal is met.`);
  ctx.engine
    .anticipate({
      as: "repair replaying the review",
      prompt: /# Assignment: Review a settled run[\s\S]*MARKER-PROSE[\s\S]*Missing fenced isotopy-orchestrator-decision/,
    })
    .reports(fenced(STOP));

  // Act
  const run = await startRun(ctx.app, {
    pipelineId: "solo",
    task: "Add search to the product",
    engine: "claude-code",
  });

  // Assert
  await waitForRunStatus(ctx.app, run.id, "completed");
  await waitForOrchestration(ctx.app, run.orchestrationId ?? "", ({ status }) => status === "stopped");
  ctx.engine.verify();
});

test("a review whose repair cannot be read either leaves the initiative waiting on its owner, saying why", async () => {
  // Anticipate — the Orchestrator answers with prose and no blocks at all, twice.
  ctx.engine.anticipate({ as: "Developer" }).reports("done");
  ctx.engine
    .anticipate({ as: "Orchestrator review" })
    .parks("Looks fine to me, nothing structured to add.", REVIEW_SESSION);
  ctx.engine
    .anticipate({ as: "repair", resumeSessionId: REVIEW_SESSION })
    .reports("Still fine, really.");

  // Act
  const run = await startRun(ctx.app, {
    pipelineId: "solo",
    task: "Add search to the product",
    engine: "claude-code",
  });

  // Assert — the run's own work stands; only the review is lost.
  const finished = await waitForRunStatus(ctx.app, run.id, "completed");
  expect(finished.closeout).toBeUndefined();
  const { body: orchestration } = await get<Orchestration>(
    ctx.app,
    `/orchestrations/${run.orchestrationId}`,
  );
  expect(orchestration.decisionError).toContain("isotopy-run-artifacts");
  expect(orchestration.decisionError).toContain("isotopy-orchestrator-decision");
  expect(orchestration.turns).toEqual([]);
  // A `stage.log` line keeps the first 1000 characters; the failure is only
  // diagnosable from what the Orchestrator actually wrote, both times.
  expect(await readReviewOutput(ctx.home, run.id, "output.md")).toContain(
    "Looks fine to me, nothing structured to add.",
  );
  expect(await readReviewOutput(ctx.home, run.id, "repair.md")).toContain("Still fine, really.");
  // TASK-157 left an initiative here reading `running` with nothing in flight,
  // and nothing in the operator log said otherwise.
  expect(orchestration.status).toBe("awaiting_user");
  expect(ctx.logger.at("error")).toContainEqual(
    expect.objectContaining({
      component: "OrchestrationService",
      fields: expect.objectContaining({ runId: run.id }),
    }),
  );
  ctx.engine.verify();
});

test("an owner's answer to an unusable review opens a fresh Orchestrator turn that carries why", async () => {
  // Anticipate — TASK-157's shape: a decision carrying `persona`, a field it has not,
  // rejected by the schema. The answer is the only way on, and the turn it
  // opens must see both the rejection and the owner's steer.
  ctx.engine
    .anticipate({ as: "Orchestrator", persona: /# Role: Orchestrator/ })
    .reports(fenced(START_PAIR));
  ctx.engine.anticipate({ as: "Developer" }).reports("Built it.\n\nVERDICT: PASS");
  ctx.engine.anticipate({ as: "QA Engineer" }).reports("Broken.\n\nVERDICT: FAIL");
  ctx.engine
    .anticipate({ as: "review with an invalid decision" })
    .reports(
      `${artifactsBlock(REVIEW_ARTIFACTS)}\n\n${fenced({
        action: "start_run",
        rationale: "A fresh pair",
        flow: "pair",
        task: "Fix the search endpoint",
        persona: "developer",
      })}`,
    );
  ctx.engine
    .anticipate({ as: "review repair repeating the invalid decision" })
    .reports(
      fenced({
        action: "start_run",
        rationale: "A fresh pair",
        flow: "pair",
        task: "Fix the search endpoint",
        persona: "developer",
      }),
    );
  ctx.engine
    .anticipate({
      as: "Orchestrator turn carrying the rejection and the answer",
      persona: /# Role: Orchestrator/,
      prompt: /could not be acted on[\s\S]*persona[\s\S]*Stop here, it is good enough/,
    })
    .reports(fenced(STOP));
  const conversation = await startOrchestration(ctx.app);
  const orchestrationId = conversation.orchestrationId ?? "";
  const composed = await teamRunOf(ctx.app, conversation);
  await waitForRunStatus(ctx.app, composed.id, "needs_attention");
  await waitForOrchestration(ctx.app, orchestrationId, ({ status }) => status === "awaiting_user");

  // Act
  const { status, body: resumed } = await post<RunState>(
    ctx.app,
    `/orchestrations/${orchestrationId}/messages`,
    { text: "Stop here, it is good enough" },
  );

  // Assert
  expect(status).toBe(201);
  await waitForRunStatus(ctx.app, resumed.id, "completed");
  await waitForOrchestration(ctx.app, orchestrationId, ({ status }) => status === "stopped");
  ctx.engine.verify();
});

test("a turn opened by an answer that is refused again waits on the owner again", async () => {
  // Anticipate — the answered turn makes the same mistake. It is judged by
  // `consume`, not by a review, so it must park on its own or the initiative
  // reads "Thinking" with nothing in flight and no answer box.
  ctx.engine.anticipate({ as: "Developer" }).reports("done");
  ctx.engine
    .anticipate({ as: "Orchestrator review" })
    .reports("Looks fine to me, nothing structured to add.");
  ctx.engine.anticipate({ as: "review repair" }).reports("Still fine, really.");
  ctx.engine
    .anticipate({ as: "Orchestrator turn after the answer", persona: /# Role: Orchestrator/ })
    .reports("Still nothing structured, sorry.");
  const run = await startRun(ctx.app, {
    pipelineId: "solo",
    task: "Add search to the product",
    engine: "claude-code",
  });
  const orchestrationId = run.orchestrationId ?? "";
  await waitForRunStatus(ctx.app, run.id, "completed");
  await waitForOrchestration(ctx.app, orchestrationId, ({ status }) => status === "awaiting_user");

  // Act
  const { body: answered } = await post<RunState>(
    ctx.app,
    `/orchestrations/${orchestrationId}/messages`,
    { text: "Try again, with a decision block" },
  );

  // Assert
  await waitForRunStatus(ctx.app, answered.id, "needs_attention");
  const orchestration = await waitForOrchestration(ctx.app, orchestrationId, ({ status }) => status === "awaiting_user");
  expect(orchestration.decisionError).toContain("isotopy-orchestrator-decision");
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
  // Arrange
  await writeTeam(ctx.home, INTERACTIVE_TEAM);

  // Anticipate — run one's stage output is bulky; its review condenses it, and
  // that condensation is what the next run's mediation turn is handed.
  ctx.engine
    .anticipate({ as: "Orchestrator", persona: /# Role: Orchestrator/ })
    .reports(fenced(START_PAIR));
  ctx.engine.anticipate({ as: "Developer" }).reports("MARKER-RAW-DEVELOPER-OUTPUT");
  ctx.engine.anticipate({ as: "QA Engineer" }).reports("MARKER-RAW-QA-OUTPUT");
  ctx.engine.anticipateRunReview({
    as: "review of the first run",
    artifacts: { summary: "MARKER-CONDENSED-SUMMARY" },
    decision: {
      action: "start_run",
      rationale: "One more pass is needed",
      flow: "pair",
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

  // Act
  const conversation = await startOrchestration(ctx.app);
  const composed = await teamRunOf(ctx.app, conversation);
  await waitForRunStatus(ctx.app, composed.id, "completed");

  // Assert — the mediation prompt matcher above carries both halves of the
  // claim; verify() is what enforces it once the second run has finished.
  const second = await waitForOrchestrationRun(
    ctx.app,
    conversation.orchestrationId ?? "",
    3,
  );
  await waitForRunStatus(ctx.app, second, "completed");
  ctx.engine.verify();
}, 20_000);

test("a rejected decision is quoted back on the restart, so the second attempt can correct it", async () => {
  // Anticipate — the dead end from TASK-139: a policy value the model invented.
  // The retry only knows what was wrong because the restart carries the rejection.
  ctx.engine
    .anticipate({ as: "Orchestrator", persona: /# Role: Orchestrator/ })
    .reports(fenced(INVENTED_POLICY_CHANGE));
  ctx.engine
    .anticipate({
      as: "second Orchestrator turn",
      prompt: /Your last decision was rejected[\s\S]*executionPolicy/,
    })
    .reports(fenced(TEAM_CHANGE));
  const conversation = await startOrchestration(ctx.app);
  await waitForRunStatus(ctx.app, conversation.id, "needs_attention");

  // Act
  const { status } = await post<RunState>(
    ctx.app,
    `/runs/${conversation.id}/restart`,
    { stageId: "orchestrate" },
  );

  // Assert — the initiative that died on one string reaches a proposed change.
  expect(status).toBe(200);
  await waitForRunStatus(ctx.app, conversation.id, "completed");
  const { body: orchestration } = await get<Orchestration>(
    ctx.app,
    `/orchestrations/${conversation.orchestrationId}`,
  );
  expect(orchestration.status).toBe("awaiting_approval");
  expect(orchestration.decisionError).toBeUndefined();
  ctx.engine.verify();
});

test("a stage that ran out of time is resumed on the restart, not started from nothing", async () => {
  // Anticipate — TASK-142's shape exactly: the build stands, QA is cut off by the
  // timeout before any verdict, and the Orchestrator restarts QA alone. The second
  // QA turn must carry the session the first one left behind, or it repeats the
  // setup that ate the clock in the first place.
  ctx.engine
    .anticipate({ as: "Orchestrator", persona: /# Role: Orchestrator/ })
    .reports(fenced(START_PAIR));
  ctx.engine.anticipate({ as: "Developer" }).reports("Built it.\n\nVERDICT: PASS");
  ctx.engine.anticipate({ as: "QA Engineer" }).timesOut(CUT_OFF_SESSION);
  ctx.engine.anticipateRunReview({
    as: "review restarting QA alone",
    decision: {
      action: "start_run",
      rationale: "Verification never delivered a verdict",
      flow: "pair",
      task: "Finish verifying",
      fromStage: "test",
    },
  });
  ctx.engine
    .anticipate({ as: "resumed QA Engineer", resumeSessionId: CUT_OFF_SESSION })
    .reports("Finished what was left.\n\nVERDICT: PASS");
  ctx.engine.anticipateRunReview({ as: "review of the resumed run" });

  // Act
  const conversation = await startOrchestration(ctx.app);
  const composed = await teamRunOf(ctx.app, conversation);

  // Assert
  await waitForRunStatus(ctx.app, composed.id, "failed");
  const second = await waitForOrchestrationRun(ctx.app, conversation.orchestrationId ?? "", 3);
  await waitForRunStatus(ctx.app, second, "completed");
  ctx.engine.verify();
});

test("a fix run that resumes the Developer's session hands it the fix it was started for", async () => {
  // Anticipate — TASK-157's Cursor loop: the Developer passes without a verdict,
  // so its session is resumable; review fails on the README, and the Orchestrator
  // sends a narrow fix back to the Developer. The resumed turn must carry that
  // fix, or the Developer finds nothing left to do and the loop never converges.
  ctx.engine
    .anticipate({ as: "Orchestrator", persona: /# Role: Orchestrator/ })
    .reports(fenced(START_PAIR));
  ctx.engine.anticipate({ as: "Developer" }).parks("Built the shell.", DEVELOPER_SESSION);
  ctx.engine
    .anticipate({ as: "QA Engineer" })
    .reports("The README claims Node 18; Vite needs 20.19.\n\nVERDICT: FAIL");
  ctx.engine.anticipateRunReview({
    as: "review sending the fix back to the Developer",
    decision: {
      action: "start_run",
      rationale: "Only the documented Node floor is wrong",
      flow: "pair",
      task: "Set the README's Node floor to 20.19",
      fromStage: "implementation",
    },
  });
  ctx.engine
    .anticipate({
      as: "resumed Developer",
      resumeSessionId: DEVELOPER_SESSION,
      prompt: /Set the README's Node floor to 20\.19/,
    })
    .reports("Raised the floor.");
  ctx.engine.anticipate({ as: "second QA Engineer" }).reports("Checked it.\n\nVERDICT: PASS");
  ctx.engine.anticipateRunReview({ as: "review of the fix run" });

  // Act
  const conversation = await startOrchestration(ctx.app);
  const composed = await teamRunOf(ctx.app, conversation);

  // Assert
  await waitForRunStatus(ctx.app, composed.id, "needs_attention");
  const fix = await waitForOrchestrationRun(ctx.app, conversation.orchestrationId ?? "", 3);
  await waitForRunStatus(ctx.app, fix, "completed");
  ctx.engine.verify();
});

test("a start_run naming a stage begins there and carries the roles before it, which do not run again", async () => {
  // Anticipate — QA was blocked, the Developer's work stands, so only QA runs
  // again. A second Developer turn would fail verify().
  ctx.engine
    .anticipate({ as: "Orchestrator", persona: /# Role: Orchestrator/ })
    .reports(fenced(START_PAIR));
  ctx.engine
    .anticipate({ as: "Developer" })
    .reports("MARKER-DEVELOPER built it.\n\nVERDICT: PASS");
  ctx.engine
    .anticipate({ as: "QA Engineer" })
    .reports("No browser was available.\n\nVERDICT: FAIL");
  ctx.engine.anticipateRunReview({
    as: "review asking QA alone to run again",
    decision: {
      action: "start_run",
      rationale: "The implementation stands; only verification is left",
      flow: "pair",
      task: "Verify the search endpoint against a connected browser",
      fromStage: "test",
    },
  });
  ctx.engine
    .anticipate({ as: "second QA Engineer", prompt: /MARKER-DEVELOPER/ })
    .reports("Checked it.\n\nVERDICT: PASS");
  ctx.engine.anticipateRunReview({ as: "review of the second run" });

  // Act
  const conversation = await startOrchestration(ctx.app);
  const composed = await teamRunOf(ctx.app, conversation);

  // Assert — the second run holds the Developer's output without a Developer turn.
  await waitForRunStatus(ctx.app, composed.id, "needs_attention");
  const second = await waitForOrchestrationRun(ctx.app, conversation.orchestrationId ?? "", 3);
  const finished = await waitForRunStatus(ctx.app, second, "completed");
  expect(stageOf(finished, "implementation").status).toBe("skipped");
  expect(finished.stageOutputs?.implementation).toContain("MARKER-DEVELOPER");
  ctx.engine.verify();
});

test("a start_run naming a stage nobody was hired for is refused, not quietly started from the top", async () => {
  // Anticipate — no second run: the decision names a role the team does not have.
  ctx.engine
    .anticipate({ as: "Orchestrator", persona: /# Role: Orchestrator/ })
    .reports(fenced(START_PAIR));
  ctx.engine.anticipate({ as: "Developer" }).reports("Built it.\n\nVERDICT: PASS");
  ctx.engine.anticipate({ as: "QA Engineer" }).reports("Checked it.\n\nVERDICT: PASS");
  ctx.engine.anticipateRunReview({
    as: "review naming a stage that does not exist",
    decision: {
      action: "start_run",
      rationale: "Security should look at it",
      flow: "pair",
      task: "Review the endpoint for injection",
      fromStage: "security",
    },
  });

  // Act
  const conversation = await startOrchestration(ctx.app);
  const composed = await teamRunOf(ctx.app, conversation);

  // Assert
  await waitForRunStatus(ctx.app, composed.id, "completed");
  const orchestrationId = conversation.orchestrationId ?? "";
  expect((await waitForOrchestration(ctx.app, orchestrationId, ({ decisionError }) => decisionError !== undefined)).decisionError).toContain(
    "Unknown stage id: security",
  );
  const { body: orchestration } = await get<Orchestration>(
    ctx.app,
    `/orchestrations/${orchestrationId}`,
  );
  expect(orchestration.runIds).toEqual([conversation.id, composed.id]);
  ctx.engine.verify();
});

test("a start_run cannot carry a stage whose role took another step in the settled run, so no review is credited that nobody ran", async () => {
  // Arrange — in `audit` the implementation role reviews rather than builds.
  await writeTeam(ctx.home, AUDIT_TEAM);

  // Anticipate — no second run: the build cannot stand in for the review.
  ctx.engine
    .anticipate({ as: "Orchestrator", persona: /# Role: Orchestrator/ })
    .reports(fenced(START_PAIR));
  ctx.engine.anticipate({ as: "Developer" }).reports("Built it.\n\nVERDICT: PASS");
  ctx.engine.anticipate({ as: "QA Engineer" }).reports("Checked it.\n\nVERDICT: PASS");
  ctx.engine.anticipateRunReview({
    as: "review carrying the build into the audit's review step",
    decision: {
      action: "start_run",
      rationale: "Audit what the pair delivered",
      flow: "audit",
      task: "Audit the search endpoint",
      fromStage: "test",
    },
  });

  // Act
  const conversation = await startOrchestration(ctx.app);
  const composed = await teamRunOf(ctx.app, conversation);

  // Assert
  await waitForRunStatus(ctx.app, composed.id, "completed");
  const orchestrationId = conversation.orchestrationId ?? "";
  expect((await waitForOrchestration(ctx.app, orchestrationId, ({ decisionError }) => decisionError !== undefined)).decisionError).toContain("never ran implementation");
  ctx.engine.verify();
});

test("a start_run cannot carry a stage the settled run never had, so no role is credited with work nobody did", async () => {
  // Anticipate — the settled run is a Single agent run, which has no
  // `implementation` stage to carry into a team run starting at `test`.
  ctx.engine
    .anticipate({ as: "Orchestrator", persona: /# Role: Orchestrator/ })
    .reports(fenced(START_PAIR));
  ctx.engine.anticipate({ as: "Developer" }).reports("Built it.\n\nVERDICT: PASS");
  ctx.engine.anticipate({ as: "QA Engineer" }).reports("Checked it.\n\nVERDICT: PASS");
  ctx.engine.anticipateRunReview({
    as: "review of the composed run",
    decision: { action: "ask_user", question: "Anything else?" },
  });
  ctx.engine.anticipate({ as: "Single agent" }).reports("Poked at it.");
  ctx.engine.anticipateRunReview({
    as: "review carrying a stage the solo run never had",
    decision: {
      action: "start_run",
      rationale: "QA should look at what the solo run did",
      flow: "pair",
      task: "Verify the endpoint",
      fromStage: "test",
    },
  });
  const conversation = await startOrchestration(ctx.app);
  const composed = await teamRunOf(ctx.app, conversation);
  await waitForRunStatus(ctx.app, composed.id, "completed");

  // Act
  const solo = await startRun(ctx.app, {
    pipelineId: "solo",
    task: "Poke at the endpoint",
    engine: "claude-code",
  });

  // Assert
  await waitForRunStatus(ctx.app, solo.id, "completed");
  const orchestrationId = conversation.orchestrationId ?? "";
  expect((await waitForOrchestration(ctx.app, orchestrationId, ({ decisionError }) => decisionError !== undefined)).decisionError).toContain("never ran implementation");
  const { body: orchestration } = await get<Orchestration>(
    ctx.app,
    `/orchestrations/${orchestrationId}`,
  );
  expect(orchestration.runIds).toEqual([conversation.id, composed.id, solo.id]);
  ctx.engine.verify();
});

test("a refused decision leaves the run re-reviewable, so the corrected decision still lands", async () => {
  // Anticipate — the first review names a stage the team does not have and is
  // refused; the re-review is shown the rejection and settles the initiative.
  ctx.engine
    .anticipate({ as: "Orchestrator", persona: /# Role: Orchestrator/ })
    .reports(fenced(START_PAIR));
  ctx.engine.anticipate({ as: "Developer" }).reports("Built it.\n\nVERDICT: PASS");
  ctx.engine.anticipate({ as: "QA Engineer" }).reports("Broken.\n\nVERDICT: FAIL");
  ctx.engine.anticipateRunReview({
    as: "review naming a stage that does not exist",
    decision: {
      action: "start_run",
      rationale: "Security should look at it",
      flow: "pair",
      task: "Review the endpoint for injection",
      fromStage: "security",
    },
  });
  ctx.engine.anticipate({ as: "second QA Engineer" }).reports("Checked it.\n\nVERDICT: PASS");
  ctx.engine.anticipateRunReview({
    as: "re-review shown why the last decision was refused",
    prompt: /Your last decision was rejected[\s\S]*security/,
    decision: STOP,
  });
  const conversation = await startOrchestration(ctx.app);
  const composed = await teamRunOf(ctx.app, conversation);
  await waitForRunStatus(ctx.app, composed.id, "needs_attention");
  await waitForOrchestration(ctx.app, conversation.orchestrationId ?? "", ({ decisionError }) => decisionError !== undefined);

  // Act
  const { status } = await post<RunState>(ctx.app, `/runs/${composed.id}/restart`, {
    stageId: "test",
  });

  // Assert — the refused decision recorded no turn, so this one is not discarded.
  expect(status).toBe(200);
  await waitForRunStatus(ctx.app, composed.id, "completed");
  const { body: orchestration } = await get<Orchestration>(
    ctx.app,
    `/orchestrations/${conversation.orchestrationId}`,
  );
  expect(orchestration.turns.at(-1)).toMatchObject({
    runId: composed.id,
    decision: { action: "stop" },
  });
  expect(orchestration.decisionError).toBeUndefined();
  ctx.engine.verify();
});

test("a fourth run is refused once three in a row ended blocked with nothing asked of the user", async () => {
  // Arrange
  await writeTeam(ctx.home, SOLO_TEAM);

  // Anticipate — the spin from TASK-139: the same team, the same blocker, again.
  // The engine is anticipated for three runs; a fourth would fail verify().
  ctx.engine
    .anticipate({ as: "Orchestrator", persona: /# Role: Orchestrator/ })
    .reports(fenced(START_PAIR));
  ctx.engine.anticipate({ as: "Developer" }).reports(BLOCKED_REPORT);
  ctx.engine.anticipateRunReview({ as: "review after the first run", decision: RETRY });
  ctx.engine.anticipate({ as: "second Developer" }).reports(BLOCKED_REPORT);
  ctx.engine.anticipateRunReview({ as: "review after the second run", decision: RETRY });
  ctx.engine.anticipate({ as: "third Developer" }).reports(BLOCKED_REPORT);
  ctx.engine.anticipateRunReview({ as: "review after the third run", decision: RETRY });

  // Act
  const conversation = await startOrchestration(ctx.app);
  const composed = await teamRunOf(ctx.app, conversation);

  // Assert — four runs on the orchestration, not five, a stated reason, and an
  // initiative that hands the next move to its owner rather than reading `running`.
  await waitForRunStatus(ctx.app, composed.id, "needs_attention");
  const orchestrationId = conversation.orchestrationId ?? "";
  const third = await waitForOrchestrationRun(ctx.app, orchestrationId, 4);
  await waitForRunStatus(ctx.app, third, "needs_attention");
  const orchestration = await waitForOrchestration(ctx.app, orchestrationId, ({ status }) => status === "awaiting_user");
  expect(orchestration.decisionError).toContain("runs in a row");
  expect(orchestration.runIds).toHaveLength(4);
  ctx.engine.verify();
}, 20_000);

test("a question asked after the run was over is answered on the initiative, not lost with it", async () => {
  // Anticipate — QA was blocked by the environment, the review asks the user,
  // and the answer opens the Orchestrator's next turn with the answer in it.
  ctx.engine
    .anticipate({ as: "Orchestrator", persona: /# Role: Orchestrator/ })
    .reports(fenced(START_PAIR));
  ctx.engine.anticipate({ as: "Developer" }).reports("Built it.\n\nVERDICT: PASS");
  ctx.engine.anticipate({ as: "QA Engineer" }).reports(BLOCKED_REPORT);
  ctx.engine.anticipateRunReview({
    as: "review parking on the user",
    decision: {
      action: "ask_user",
      question: "Connect a browser under Settings → Computer use, then say when it is ready",
    },
  });
  ctx.engine
    .anticipate({
      as: "Orchestrator turn carrying the answer",
      persona: /# Role: Orchestrator/,
      prompt: /The user's answer[\s\S]*Connected the browser/,
    })
    .reports(fenced(STOP));
  const conversation = await startOrchestration(ctx.app);
  const orchestrationId = conversation.orchestrationId ?? "";
  const composed = await teamRunOf(ctx.app, conversation);
  await waitForRunStatus(ctx.app, composed.id, "needs_attention");
  await waitForOrchestration(ctx.app, orchestrationId, ({ status }) => status === "awaiting_user");

  // Act
  const { status, body: resumed } = await post<RunState>(
    ctx.app,
    `/orchestrations/${orchestrationId}/messages`,
    { text: "Connected the browser" },
  );

  // Assert — a new conversation turn on the same initiative, which then settles it.
  expect(status).toBe(201);
  expect(resumed.pipelineId).toBe("orchestration");
  await waitForRunStatus(ctx.app, resumed.id, "completed");
  const settled = await waitForOrchestration(ctx.app, orchestrationId, ({ status }) => status === "stopped");
  expect(settled.runIds).toEqual([conversation.id, composed.id, resumed.id]);
  ctx.engine.verify();
});

test("an initiative answer starts partway through the team from the last work run", async () => {
  // Anticipate — the follow-up conversation chooses a partial retry, whose
  // carried implementation must come from the composed run it discussed.
  ctx.engine
    .anticipate({ as: "Orchestrator", persona: /# Role: Orchestrator/ })
    .reports(fenced(START_PAIR));
  ctx.engine
    .anticipate({ as: "Developer" })
    .reports("MARKER-DEVELOPER built it.\n\nVERDICT: PASS");
  ctx.engine.anticipate({ as: "QA Engineer" }).reports(BLOCKED_REPORT);
  ctx.engine.anticipateRunReview({
    as: "review parking on the user",
    decision: {
      action: "ask_user",
      question: "Connect a browser, then say when it is ready",
    },
  });
  ctx.engine
    .anticipate({
      as: "Orchestrator turn carrying the answer",
      persona: /# Role: Orchestrator/,
      prompt: /The user's answer[\s\S]*Connected the browser/,
    })
    .reports(
      fenced({
        action: "start_run",
        rationale: "The implementation stands; only verification is left",
        flow: "pair",
        task: "Verify the search endpoint against the connected browser",
        fromStage: "test",
      }),
    );
  ctx.engine
    .anticipate({ as: "resumed QA Engineer", prompt: /MARKER-DEVELOPER/ })
    .reports("Checked it.\n\nVERDICT: PASS");
  ctx.engine.anticipateRunReview({ as: "review of the resumed run" });
  const conversation = await startOrchestration(ctx.app);
  const orchestrationId = conversation.orchestrationId ?? "";
  const composed = await teamRunOf(ctx.app, conversation);
  await waitForRunStatus(ctx.app, composed.id, "needs_attention");
  await waitForOrchestration(ctx.app, orchestrationId, ({ status }) => status === "awaiting_user");

  // Act
  const { status, body: followUp } = await post<RunState>(
    ctx.app,
    `/orchestrations/${orchestrationId}/messages`,
    { text: "Connected the browser" },
  );

  // Assert
  expect(status).toBe(201);
  await waitForRunStatus(ctx.app, followUp.id, "completed");
  const resumedId = await waitForOrchestrationRun(ctx.app, orchestrationId, 4);
  const resumed = await waitForRunStatus(ctx.app, resumedId, "completed");
  expect(stageOf(resumed, "implementation").status).toBe("skipped");
  expect(resumed.stageOutputs?.implementation).toContain("MARKER-DEVELOPER");
  ctx.engine.verify();
});

test("an answer sent to the initiative reaches the stage that is still asking", async () => {
  // Anticipate — the conversation itself is parked, so the answer belongs to
  // that session rather than to a new turn.
  ctx.engine
    .anticipate({ as: "Orchestrator question", persona: /# Role: Orchestrator/ })
    .parks(fenced({ action: "ask_user", question: "Which database?" }), "orchestration-session");
  ctx.engine
    .anticipate({
      as: "Orchestrator proposal",
      resumeSessionId: "orchestration-session",
      prompt: /Postgres/,
    })
    .reports(fenced(START_PAIR));
  const conversation = await startOrchestration(ctx.app);
  await waitForStageStatus(ctx.app, conversation.id, "orchestrate", "asking");

  // Act
  const { status, body: answered } = await post<RunState>(
    ctx.app,
    `/orchestrations/${conversation.orchestrationId}/messages`,
    { text: "Postgres" },
  );

  // Assert — no second run: the parked stage took the answer.
  expect(status).toBe(201);
  expect(answered.id).toBe(conversation.id);
  await waitForRunStatus(ctx.app, conversation.id, "completed");
  const { body: orchestration } = await get<Orchestration>(
    ctx.app,
    `/orchestrations/${conversation.orchestrationId}`,
  );
  expect(orchestration.runIds).toEqual([conversation.id]);
  ctx.engine.verify();
});

function readReviewOutput(home: string, runId: string, file: string): Promise<string> {
  return readFile(path.join(home, "runs", runId, "review-run", file), "utf8");
}

function readCloseout(home: string, runId: string): Promise<string> {
  return readFile(path.join(home, "runs", runId, "closeout", "closeout.md"), "utf8");
}

function artifactsBlock(report: unknown): string {
  return `\`\`\`isotopy-run-artifacts\n${JSON.stringify(report)}\n\`\`\``;
}

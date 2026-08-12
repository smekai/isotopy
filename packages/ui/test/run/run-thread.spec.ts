// Unit spec: the thread is fed by two loads that race — the run arrives on its
// own SSE subscription, the orchestration on a separate fetch — and merging them
// wrong is how a decision lands above the turn that produced it, or how the
// Orchestrator's question appears twice because it is already a chat message.
import { expect, test } from "vitest";
import type { OrchestratorDecision } from "@adhd/core";
import { runThread } from "../../src/run-thread";
import { RUN_ID, log, run, started } from "../support/run-fixtures";
import { orchestratedRun, orchestration, role, team } from "../support/orchestration-fixtures";

const STAGE_AT = "2026-08-01T09:00:00.000Z";
const SPOKE_AT = "2026-08-01T09:00:01.000Z";
const PROPOSED_AT = "2026-08-01T09:00:02.000Z";
const ASKED_AT = "2026-08-01T09:00:03.000Z";

test("an ask_user decision adds nothing, because the question is already a chat turn", () => {
  // Arrange — the same question, from both sources: the decision the
  // Orchestrator recorded and the message the composer will answer.
  const state = {
    ...run([started("orchestrate", "asking", STAGE_AT)]),
    messages: [
      { id: "m1", ts: ASKED_AT, role: "agent" as const, kind: "question" as const, text: "Which database?" },
    ],
  };
  const live = orchestration({
    status: "awaiting_user",
    turns: [turn(askUser("Which database?"), ASKED_AT)],
  });

  // Act
  const items = runThread(state, live, []);

  // Assert
  expect(items.filter((item) => item.ts === ASKED_AT).map((item) => item.kind)).toEqual([
    "agent",
  ]);
});

test("a proposal sorts after the turn that spoke it, not above it", () => {
  // Arrange
  const state = run([started("orchestrate", "running", STAGE_AT, [
    log(SPOKE_AT, "info", "Here is the team I suggest"),
  ])]);
  const live = orchestration({
    status: "awaiting_approval",
    latestDecision: proposeTeam(),
    turns: [turn(proposeTeam(), PROPOSED_AT)],
  });

  // Act
  const items = runThread(state, live, []);

  // Assert
  expect(items.map((item) => item.kind)).toEqual(["stage", "agent", "proposal"]);
});

test("only the newest proposal is still open, so an earlier one cannot be approved twice", () => {
  // Arrange
  const live = orchestration({
    status: "awaiting_approval",
    latestDecision: proposeTeam(),
    turns: [turn(proposeTeam(), SPOKE_AT), turn(proposeTeam(), PROPOSED_AT)],
  });

  // Act
  const items = runThread(run([]), live, []);

  // Assert
  expect(
    items.map((item) => item.kind === "proposal" && item.awaitingApproval),
  ).toEqual([false, true]);
});

test("an approved proposal reads back as the team approved, not the team proposed", () => {
  // Arrange — approval merges the user's tier edits into approvedTeam, so the
  // original decision.team would show Deep for a role the user dropped to Fast.
  const proposed = team({ roles: [role({ id: "implementation", modelTier: "deep" })] });
  const approved = team({ roles: [role({ id: "implementation", modelTier: "fast" })] });
  const live = orchestration({
    status: "running",
    turns: [turn({ action: "propose_team", rationale: "Small scope", team: proposed }, PROPOSED_AT)],
    approvedTeam: approved,
  });

  // Act
  const items = runThread(run([]), live, []);

  // Assert
  expect(items.map((item) => item.kind === "proposal" && item.team.roles[0]?.modelTier)).toEqual([
    "fast",
  ]);
});

test("a proposal still open shows what was proposed, because approval has not merged yet", () => {
  // Arrange — a stale approvedTeam from an earlier round must not leak forward.
  const live = orchestration({
    status: "awaiting_approval",
    latestDecision: proposeTeam(),
    turns: [turn(proposeTeam(), PROPOSED_AT)],
    approvedTeam: team({ roles: [role({ id: "implementation", modelTier: "max" })] }),
  });

  // Act
  const items = runThread(run([]), live, []);

  // Assert
  expect(items.map((item) => item.kind === "proposal" && item.team.roles[0]?.modelTier)).toEqual([
    undefined,
  ]);
});

test("a question escalated from a child run stays reachable instead of vanishing", () => {
  // Arrange — escalate_to_user sets the initiative to awaiting_user, but the
  // question is appended to the run that asked it, not to this thread.
  const live = orchestration({
    status: "awaiting_user",
    turns: [
      {
        runId: "child-1",
        decision: { action: "escalate_to_user", question: "Which database?", originStageId: "test" },
        at: ASKED_AT,
      },
    ],
  });

  // Act
  const items = runThread(run([]), live, []);

  // Assert
  expect(items.map((item) => item.kind === "elsewhere" && item.runId)).toEqual(["child-1"]);
});

test("a child run appears at the point it was started, keyed by run rather than position", () => {
  // Arrange
  const child = orchestratedRun("child-1", PROPOSED_AT);
  const live = orchestration({ runIds: ["child-1"] });

  // Act
  const items = runThread(run([]), live, [child]);

  // Assert
  expect(items.map((item) => item.key)).toEqual(["orch:run:child-1"]);
});

test("the thread's own run is not linked from inside itself", () => {
  // Arrange — runIds includes the orchestration run whose thread this is.
  const self = orchestratedRun(RUN_ID, PROPOSED_AT);
  const live = orchestration({ runIds: [RUN_ID] });

  // Act
  const items = runThread(run([]), live, [self]);

  // Assert
  expect(items).toEqual([]);
});

test("a run id with no loaded summary is dropped rather than rendered as a gap", () => {
  // Arrange — runIds can name a run the list has not fetched yet.
  const live = orchestration({ runIds: ["child-1"] });

  // Act
  const items = runThread(run([]), live, []);

  // Assert
  expect(items).toEqual([]);
});

test("the conversation keeps its keys when the orchestration lands after it", () => {
  // Arrange — the run almost always wins the race, so the thread renders once
  // without orchestration and again with it; a key that changed would remount.
  const state = run([started("orchestrate", "running", STAGE_AT, [
    log(SPOKE_AT, "info", "Here is the team I suggest"),
  ])]);
  const before = runThread(state, undefined, []);

  // Act
  const after = runThread(
    state,
    orchestration({ turns: [turn(proposeTeam(), PROPOSED_AT)] }),
    [],
  );

  // Assert
  expect(after.slice(0, before.length).map((item) => item.key)).toEqual(
    before.map((item) => item.key),
  );
});

function turn(decision: OrchestratorDecision, at: string) {
  return { runId: "r1", decision, at };
}

function proposeTeam(): OrchestratorDecision {
  return { action: "propose_team", rationale: "Two specialists cover it", team: team() };
}

function askUser(question: string): OrchestratorDecision {
  return { action: "ask_user", question };
}

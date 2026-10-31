// Unit spec: the Approve control is the one irreversible thing the orchestrator
// panel offers, and the server rejects an approval whose status and decision
// disagree. The guard therefore has to read both, not either.
import { describe, expect, test } from "vitest";
import type { OrchestrationTurn } from "@isotopy/core";
import { startReasonFor, teamChangeAwaitingApproval } from "../src/orchestration";
import { PROPOSED_TEAM, orchestratedRun, orchestration, teamChange } from "./support/orchestration-fixtures";

describe("teamChangeAwaitingApproval", () => {
  test("offers the team.md the orchestrator is holding for approval", () => {
    expect(
      teamChangeAwaitingApproval(
        orchestration({ status: "awaiting_approval", latestDecision: teamChange() }),
      ),
    ).toBe(PROPOSED_TEAM);
  });

  test("withholds a change the orchestrator has already moved past", () => {
    expect(
      teamChangeAwaitingApproval(orchestration({ status: "running", latestDecision: teamChange() })),
    ).toBeUndefined();
  });

  test("withholds approval when the awaited decision is not a team change at all", () => {
    expect(
      teamChangeAwaitingApproval(
        orchestration({
          status: "awaiting_approval",
          latestDecision: { action: "ask_user", question: "Which database?" },
        }),
      ),
    ).toBeUndefined();
  });
});

describe("startReasonFor", () => {
  test("gives the rationale of the decision that started the run", () => {
    // Arrange
    const initiative = orchestration({
      runIds: ["conversation", "fix"],
      turns: [startRunTurn("2026-08-01T10:00:00.000Z", "The tester found a missing aria-live.")],
    });

    // Act
    const reason = startReasonFor(initiative, orchestratedRun("fix", "2026-08-01T10:00:01.000Z"));

    // Assert
    expect(reason).toBe("The tester found a missing aria-live.");
  });

  test("gives nothing for the conversation an initiative began as", () => {
    // Arrange — run one is the Orchestrator talking to the user; no decision started it.
    const initiative = orchestration({
      runIds: ["conversation"],
      turns: [startRunTurn("2026-08-01T10:00:00.000Z", "Build it.")],
    });

    // Act
    const reason = startReasonFor(
      initiative,
      orchestratedRun("conversation", "2026-08-01T09:00:00.000Z"),
    );

    // Assert
    expect(reason).toBeUndefined();
  });

  test("reads the decision nearest the run, not the first one the initiative made", () => {
    // Arrange
    const initiative = orchestration({
      runIds: ["build", "fix"],
      turns: [
        startRunTurn("2026-08-01T10:00:00.000Z", "Build the timer."),
        startRunTurn("2026-08-01T12:00:00.000Z", "Run two failed on accessibility."),
      ],
    });

    // Act
    const reason = startReasonFor(initiative, orchestratedRun("fix", "2026-08-01T12:00:01.000Z"));

    // Assert
    expect(reason).toBe("Run two failed on accessibility.");
  });
});

function startRunTurn(at: string, rationale: string): OrchestrationTurn {
  return {
    runId: "conversation",
    at,
    decision: { action: "start_run", rationale, flow: "delivery", task: "Do the work." },
  };
}

describe("startReasonFor across other decisions", () => {
  test("ignores a decision that starts no run, keeping the launch that did", () => {
    // Arrange — a question parked between the launch and the run must not blank the reason.
    const initiative = orchestration({
      runIds: ["build"],
      turns: [
        startRunTurn("2026-08-01T10:00:00.000Z", "A Developer and a Tester cover this."),
        {
          runId: "conversation",
          at: "2026-08-01T10:00:00.500Z",
          decision: { action: "ask_user", question: "Which database?" },
        },
      ],
    });

    // Act
    const reason = startReasonFor(initiative, orchestratedRun("build", "2026-08-01T10:00:01.000Z"));

    // Assert
    expect(reason).toBe("A Developer and a Tester cover this.");
  });
});

// Unit spec: the Approve control is the one irreversible thing the orchestrator
// panel offers, and the server rejects an approval whose status and decision
// disagree. The guard therefore has to read both, not either.
import { describe, expect, test } from "vitest";
import type { OrchestrationTurn } from "@isotopy/core";
import { startReasonFor, teamAwaitingApproval } from "../src/orchestration";
import { orchestratedRun, orchestration, team } from "./support/orchestration-fixtures";

describe("teamAwaitingApproval", () => {
  test("offers the team the orchestrator is holding for approval", () => {
    const proposal = team({ name: "Delivery trio" });
    expect(
      teamAwaitingApproval(
        orchestration({
          status: "awaiting_approval",
          latestDecision: { action: "propose_team", rationale: "Small scope.", team: proposal },
        }),
      ),
    ).toEqual(proposal);
  });

  test("withholds a team the orchestrator has already moved past", () => {
    expect(
      teamAwaitingApproval(
        orchestration({
          status: "running",
          latestDecision: { action: "propose_team", rationale: "Small scope.", team: team() },
        }),
      ),
    ).toBeUndefined();
  });

  test("withholds approval when the awaited decision is not a team at all", () => {
    expect(
      teamAwaitingApproval(
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
    decision: { action: "start_run", rationale, task: "Do the work." },
  };
}

describe("startReasonFor over a proposal-started run", () => {
  test("attributes an approved team's first run to the proposal that created it", () => {
    // Arrange — the first work run of every initiative comes from approveTeam acting
    // on a propose_team turn, and no start_run exists yet.
    const initiative = orchestration({
      runIds: ["conversation", "build"],
      turns: [proposeTeamTurn("2026-08-01T10:00:00.000Z", "A Developer and a Tester cover this.")],
    });

    // Act
    const reason = startReasonFor(initiative, orchestratedRun("build", "2026-08-01T10:00:01.000Z"));

    // Assert
    expect(reason).toBe("A Developer and a Tester cover this.");
  });

  test("does not hand a proposal-started run an older start_run's rationale", () => {
    // Arrange — a re-composed team auto-launches from propose_team when the roles are
    // unchanged, so a stale start_run sits before it and used to win on timestamp alone.
    const initiative = orchestration({
      runIds: ["fix", "next"],
      turns: [
        startRunTurn("2026-08-01T10:00:00.000Z", "Run two failed on accessibility."),
        proposeTeamTurn("2026-08-01T14:00:00.000Z", "The same team can take the next feature."),
      ],
    });

    // Act
    const reason = startReasonFor(initiative, orchestratedRun("next", "2026-08-01T14:00:01.000Z"));

    // Assert
    expect(reason).toBe("The same team can take the next feature.");
  });

  test("ignores a decision that starts no run, keeping the launch that did", () => {
    // Arrange — a question parked between the launch and the run must not blank the reason.
    const initiative = orchestration({
      runIds: ["build"],
      turns: [
        proposeTeamTurn("2026-08-01T10:00:00.000Z", "A Developer and a Tester cover this."),
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

function proposeTeamTurn(at: string, rationale: string): OrchestrationTurn {
  return {
    runId: "conversation",
    at,
    decision: { action: "propose_team", rationale, team: team() },
  };
}

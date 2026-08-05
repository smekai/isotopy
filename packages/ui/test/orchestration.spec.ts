// Unit spec: the Approve control is the one irreversible thing the orchestrator
// panel offers, and the server rejects an approval whose status and decision
// disagree. The guard therefore has to read both, not either.
import { describe, expect, test } from "vitest";
import { teamAwaitingApproval } from "../src/orchestration";
import { orchestration, team } from "./support/orchestration-fixtures";

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

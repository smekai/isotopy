// Pure spec: the pending per-role tiers are the one piece of edit state that
// outlives the thing it edits. A map kept across a project switch or a
// superseded proposal can override a team the user never looked at, or send a
// role id that no longer exists and have the approval rejected.
import { expect, test } from "vitest";
import type { Orchestration } from "@isotopy/core";
import { pendingTiersFor, withPendingTier } from "../src/orchestration";
import { orchestration, role, team } from "./support/orchestration-fixtures";

const OTHER_ID = "o2";

test("edits made against one initiative do not reach another", () => {
  const pending = withPendingTier(null, OTHER_ID, "design", "fast");

  expect(pendingTiersFor(pending, awaitingApproval())).toEqual({});
});

test("a role the current proposal does not have is dropped rather than sent", () => {
  const pending = withPendingTier(null, "o1", "gone", "fast");

  expect(pendingTiersFor(pending, awaitingApproval())).toEqual({});
});

test("edits for roles the proposal still has are kept", () => {
  const pending = withPendingTier(null, "o1", "design", "fast");

  expect(pendingTiersFor(pending, awaitingApproval())).toEqual({ design: "fast" });
});

test("a cleared preset survives as null, because absent would mean unchanged", () => {
  const pending = withPendingTier(null, "o1", "design", null);

  expect(pendingTiersFor(pending, awaitingApproval())).toEqual({ design: null });
});

test("an initiative with no team awaiting approval has nothing to edit", () => {
  const pending = withPendingTier(null, "o1", "design", "fast");

  expect(pendingTiersFor(pending, orchestration({ status: "running" }))).toEqual({});
});

test("switching to another initiative starts its edits from empty, not from the last one's", () => {
  const first = withPendingTier(null, "o1", "design", "fast");

  const second = withPendingTier(first, OTHER_ID, "build", "deep");

  expect(second).toEqual({ orchestrationId: OTHER_ID, tiers: { build: "deep" } });
});

test("a second edit on the same initiative joins the first", () => {
  const first = withPendingTier(null, "o1", "design", "fast");

  const second = withPendingTier(first, "o1", "build", "deep");

  expect(second.tiers).toEqual({ design: "fast", build: "deep" });
});

function awaitingApproval(): Orchestration {
  return orchestration({
    status: "awaiting_approval",
    latestDecision: {
      action: "propose_team",
      rationale: "Design first, then build.",
      team: team({ roles: [role({ id: "design" }), role({ id: "build" })] }),
    },
  });
}

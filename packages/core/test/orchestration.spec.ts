import { describe, expect, test } from "vitest";
import {
  orchestrationStatusFor,
  orchestratorDecisionSchema,
} from "../src/orchestration.ts";
import type { OrchestratorDecision } from "../src/orchestration.ts";

const TEAM = {
  name: "Delivery pair",
  summary: "Build it and check it",
  roles: [
    {
      id: "implementation",
      label: "Developer",
      skill: "developer",
      stepTask: "implement-feature",
    },
  ],
};

describe("orchestratorDecisionSchema", () => {
  test("an action outside the roster is rejected rather than treated as a new one", () => {
    const parsed = orchestratorDecisionSchema.safeParse({
      action: "fire_everyone",
      reason: "bored",
    });

    expect(parsed.success).toBe(false);
  });

  test("an unknown field rejects the whole decision instead of being dropped", () => {
    const parsed = orchestratorDecisionSchema.safeParse({
      action: "stop",
      reason: "done",
      confidence: 0.9,
    });

    expect(parsed.success).toBe(false);
  });

  test("a payload belonging to a different action does not satisfy this one", () => {
    const parsed = orchestratorDecisionSchema.safeParse({
      action: "propose_team",
      rationale: "two is enough",
      question: "which database?",
    });

    expect(parsed.success).toBe(false);
  });

  test("a team with no roles is rejected — an empty team is not a proposal", () => {
    const parsed = orchestratorDecisionSchema.safeParse({
      action: "propose_team",
      rationale: "nobody needed",
      team: { ...TEAM, roles: [] },
    });

    expect(parsed.success).toBe(false);
  });

  test("an execution policy outside the stage roster is rejected", () => {
    const parsed = orchestratorDecisionSchema.safeParse({
      action: "propose_team",
      rationale: "quality matters",
      team: {
        ...TEAM,
        roles: [{ ...TEAM.roles[0], executionPolicy: "whenever" }],
      },
    });

    expect(parsed.success).toBe(false);
  });

  test("a complete team proposal keeps its roles", () => {
    const parsed = orchestratorDecisionSchema.safeParse({
      action: "propose_team",
      rationale: "one developer covers this",
      team: TEAM,
    });

    expect(parsed.success && parsed.data).toMatchObject({
      action: "propose_team",
      team: { roles: [{ skill: "developer" }] },
    });
  });
});

describe("orchestrationStatusFor", () => {
  test("a proposed team waits for the user's approval before anything runs", () => {
    expect(orchestrationStatusFor(decision("propose_team"))).toBe("awaiting_approval");
  });

  test("a question of the Orchestrator's own parks on the user", () => {
    expect(orchestrationStatusFor(decision("ask_user"))).toBe("awaiting_user");
  });

  test("an escalated question parks on the user just as its own question does", () => {
    expect(orchestrationStatusFor(decision("escalate_to_user"))).toBe("awaiting_user");
  });

  test("stopping is terminal", () => {
    expect(orchestrationStatusFor(decision("stop"))).toBe("stopped");
  });

  test("an action the Orchestrator resolves itself keeps the conversation going", () => {
    expect(orchestrationStatusFor(decision("answer_agent"))).toBe("conversing");
  });
});

/** A whole valid decision from the one field a test cares about: its action. */
function decision(action: OrchestratorDecision["action"]): OrchestratorDecision {
  return orchestratorDecisionSchema.parse({ ...PAYLOADS[action], action });
}

const PAYLOADS: Record<OrchestratorDecision["action"], Record<string, unknown>> = {
  propose_team: { rationale: "one developer covers this", team: TEAM },
  delegate_milestone_planning: { rationale: "needs a backlog", goal: "Ship search" },
  start_run: { rationale: "team approved", task: "Implement search" },
  ask_user: { question: "Which database?" },
  stop: { reason: "goal met" },
  answer_agent: { answer: "Postgres", rationale: "named in the approved scope" },
  escalate_to_user: { question: "Which database?", originStageId: "implementation" },
  route_to_agent: {
    stageId: "implementation",
    message: "Use Postgres",
    rationale: "the Developer asked",
  },
};

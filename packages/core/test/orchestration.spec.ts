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

  test("starting a run reports running, not conversing — the decision now launches one", () => {
    expect(orchestrationStatusFor(decision("start_run"))).toBe("running");
  });

  test("delegating milestone planning reports running for the same reason", () => {
    expect(orchestrationStatusFor(decision("delegate_milestone_planning"))).toBe("running");
  });

  test("continuing a milestone reports running", () => {
    expect(orchestrationStatusFor(decision("continue_milestone"))).toBe("running");
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
  continue_milestone: { rationale: "the next feature is ready" },
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

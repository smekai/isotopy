import type {
  Orchestration,
  OrchestrationStatus,
  OrchestratorDecision,
  OrchestratorTeamProposal,
} from "@adhd/core";

const STATUS_LABELS: Record<OrchestrationStatus, string> = {
  conversing: "Thinking",
  awaiting_user: "Needs your answer",
  awaiting_approval: "Team awaiting approval",
  running: "Running",
  stopped: "Stopped",
};

export function orchestrationStatusLabel(status: OrchestrationStatus): string {
  return STATUS_LABELS[status];
}

export function orchestrationNeedsUser(status: OrchestrationStatus): boolean {
  return status === "awaiting_user" || status === "awaiting_approval";
}

export function teamAwaitingApproval(
  orchestration: Orchestration,
): OrchestratorTeamProposal | undefined {
  const decision = orchestration.latestDecision;
  return orchestration.status === "awaiting_approval" &&
    decision?.action === "propose_team"
    ? decision.team
    : undefined;
}

export interface DecisionPresentation {
  title: string;
  detail: string;
}

export function decisionPresentation(
  decision: OrchestratorDecision,
): DecisionPresentation {
  switch (decision.action) {
    case "propose_team":
      return { title: `Proposed the team "${decision.team.name}"`, detail: decision.rationale };
    case "delegate_milestone_planning":
      return { title: "Delegated milestone planning", detail: decision.rationale };
    case "start_run":
      return { title: "Started a team run", detail: decision.rationale };
    case "continue_milestone":
      return { title: "Continued the milestone", detail: decision.rationale };
    case "ask_user":
      return { title: "Asked you a question", detail: decision.question };
    case "stop":
      return { title: "Stopped", detail: decision.summary ?? decision.reason };
    case "answer_agent":
      return { title: "Answered an agent", detail: decision.rationale };
    case "escalate_to_user":
      return { title: "Escalated a question to you", detail: decision.question };
    case "route_to_agent":
      return { title: `Routed a message to ${decision.stageId}`, detail: decision.rationale };
    default: {
      const unreachable: never = decision;
      return unreachable;
    }
  }
}

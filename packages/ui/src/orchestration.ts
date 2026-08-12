import type {
  ModelTier,
  Orchestration,
  OrchestrationStatus,
  OrchestratorDecision,
  OrchestratorTeamProposal,
  RunState,
  RunSummary,
} from "@adhd/core";
import { isTerminalRunStatus, parkedQuestion } from "@adhd/core";

export interface OrchestratorView {
  orchestration: Orchestration;
  runs: RunSummary[];
  busy: boolean;
  roleTiers: Record<string, ModelTier | null>;
  onApprove: () => void;
  onRoleTierChange: (roleId: string, tier: ModelTier | null) => void;
  onOpenRun: (runId: string) => void;
}

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

export function answerableQuestion(
  orchestration: Orchestration | undefined,
  runStatus: RunState["status"],
): string | undefined {
  return orchestration && isTerminalRunStatus(runStatus)
    ? parkedQuestion(orchestration)
    : undefined;
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

export interface PendingRoleTiers {
  orchestrationId: string;
  tiers: Record<string, ModelTier | null>;
}

export function pendingTiersFor(
  pending: PendingRoleTiers | null,
  orchestration: Orchestration | undefined,
): Record<string, ModelTier | null> {
  const team = orchestration && teamAwaitingApproval(orchestration);
  if (!pending || !orchestration || pending.orchestrationId !== orchestration.id || !team) {
    return {};
  }
  const proposed = new Set(team.roles.map((role) => role.id));
  return Object.fromEntries(
    Object.entries(pending.tiers).filter(([roleId]) => proposed.has(roleId)),
  );
}

export function withPendingTier(
  pending: PendingRoleTiers | null,
  orchestrationId: string,
  roleId: string,
  tier: ModelTier | null,
): PendingRoleTiers {
  const kept = pending?.orchestrationId === orchestrationId ? pending.tiers : {};
  return { orchestrationId, tiers: { ...kept, [roleId]: tier } };
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

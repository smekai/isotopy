import type {
  Orchestration,
  OrchestrationStatus,
  OrchestratorDecision,
  RunState,
  RunSummary,
} from "@isotopy/core";
import { isTerminalRunStatus, parkedQuestion } from "@isotopy/core";

export interface OrchestratorView {
  orchestration: Orchestration;
  runs: RunSummary[];
  busy: boolean;
  currentTeam?: string;
  onApprove: () => void;
  onOpenRun: (runId: string) => void;
}

const STATUS_LABELS: Record<OrchestrationStatus, string> = {
  conversing: "Thinking",
  awaiting_user: "Needs your answer",
  awaiting_approval: "Team change awaiting approval",
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

export function teamRevision(orchestrations: Orchestration[]): string | undefined {
  return orchestrations.reduce<string | undefined>(
    (latest, orchestration) =>
      latest === undefined || orchestration.updatedAt > latest ? orchestration.updatedAt : latest,
    undefined,
  );
}

export function teamChangeAwaitingApproval(orchestration: Orchestration): string | undefined {
  const decision = orchestration.latestDecision;
  return orchestration.status === "awaiting_approval" && decision?.action === "propose_team_change"
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
    case "propose_team_change":
      return { title: "Proposed a change to the team", detail: decision.rationale };
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

function launchRationale(decision: OrchestratorDecision): string | undefined {
  return decision.action === "start_run" ? decision.rationale : undefined;
}

export function startReasonFor(
  orchestration: Orchestration,
  run: RunSummary,
): string | undefined {
  let reason: string | undefined;
  for (const turn of orchestration.turns) {
    if (turn.at <= run.createdAt) {
      reason = launchRationale(turn.decision) ?? reason;
    }
  }
  return reason;
}

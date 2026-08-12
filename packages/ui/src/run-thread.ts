import type {
  Orchestration,
  OrchestratorDecision,
  OrchestratorTeamProposal,
  RunState,
  RunSummary,
} from "@adhd/core";
import { teamAwaitingApproval } from "./orchestration.ts";
import type { ConversationItem } from "./transcript.ts";
import { buildTranscript, conversationOnly } from "./transcript.ts";

export type OrchestrationItem =
  | {
      kind: "proposal";
      key: string;
      ts: string;
      team: OrchestratorTeamProposal;
      awaitingApproval: boolean;
    }
  | { kind: "child-run"; key: string; ts: string; run: RunSummary }
  | { kind: "verdict"; key: string; ts: string; title: string; detail: string };

export type ThreadItem = ConversationItem | OrchestrationItem;

const RANK: Record<ThreadItem["kind"], number> = {
  stage: 0,
  agent: 1,
  notice: 2,
  user: 3,
  proposal: 4,
  verdict: 5,
  "child-run": 6,
};

export function runThread(
  run: RunState,
  orchestration: Orchestration | undefined,
  runs: RunSummary[],
): ThreadItem[] {
  const conversation: ThreadItem[] = conversationOnly(buildTranscript(run));
  if (orchestration === undefined) {
    return conversation;
  }
  return [...conversation, ...orchestrationItems(orchestration, runs, run.id)].sort(
    (a, b) => a.ts.localeCompare(b.ts) || RANK[a.kind] - RANK[b.kind],
  );
}

function orchestrationItems(
  orchestration: Orchestration,
  runs: RunSummary[],
  threadRunId: string,
): OrchestrationItem[] {
  const openProposal = teamAwaitingApproval(orchestration) !== undefined;
  const last = orchestration.turns.length - 1;
  const byId = new Map(runs.map((run) => [run.id, run]));
  return [
    ...orchestration.turns.flatMap((turn, index) =>
      itemForDecision(turn.decision, turn.at, `orch:turn:${index}`, openProposal && index === last),
    ),
    ...orchestration.runIds
      .filter((runId) => runId !== threadRunId)
      .flatMap((runId) => childRunItem(byId.get(runId))),
  ];
}

function childRunItem(run: RunSummary | undefined): OrchestrationItem[] {
  return run === undefined
    ? []
    : [{ kind: "child-run", key: `orch:run:${run.id}`, ts: run.createdAt, run }];
}

function itemForDecision(
  decision: OrchestratorDecision,
  ts: string,
  key: string,
  awaitingApproval: boolean,
): OrchestrationItem[] {
  switch (decision.action) {
    case "propose_team":
      return [{ kind: "proposal", key, ts, team: decision.team, awaitingApproval }];
    case "stop":
      return [verdict(key, ts, "Stopped", decision.summary ?? decision.reason)];
    case "delegate_milestone_planning":
      return [verdict(key, ts, "Delegated milestone planning", decision.rationale)];
    case "continue_milestone":
      return [verdict(key, ts, "Continued the milestone", decision.rationale)];
    case "ask_user":
    case "escalate_to_user":
    case "answer_agent":
    case "route_to_agent":
    case "start_run":
      return [];
    default: {
      const unreachable: never = decision;
      return unreachable;
    }
  }
}

function verdict(key: string, ts: string, title: string, detail: string): OrchestrationItem {
  return { kind: "verdict", key, ts, title, detail };
}

import type { Orchestration, OrchestratorAction, RunState, StopDecision } from "@isotopy/core";

export const STOPPED_BY_USER: StopDecision = { action: "stop", reason: "Stopped by user" };

export const SUPERSEDED: StopDecision = {
  action: "stop",
  reason: "Superseded by a new Orchestrator",
};

export const RETIRED_AS_DUPLICATE: StopDecision = {
  action: "stop",
  reason: "Retired when the project adopted one active Orchestrator",
};

export function activeOrchestrations(
  all: Iterable<Orchestration>,
  projectId: string,
): Orchestration[] {
  return [...all]
    .filter(
      (orchestration) =>
        orchestration.projectId === projectId && orchestration.status !== "stopped",
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export interface SettledLaunch {
  action: OrchestratorAction;
  status?: RunState["status"];
}

export const NO_APPROVED_TEAM =
  "The Orchestrator asked to start a run before a team was approved";

export const PROPOSAL_NEEDS_TASK =
  "A team proposed after a run has settled must carry the task its run will do — " +
  "add a `task` field, or use start_run to reuse the team already composed";

export const BLOCKED_LAUNCH_LIMIT = 3;

export function blockedLaunchStreak(launches: SettledLaunch[]): number {
  let streak = 0;
  for (let index = launches.length - 1; index >= 0; index -= 1) {
    const launch = launches[index];
    if (launch?.action !== "start_run" || !clearedNothing(launch.status)) {
      return streak;
    }
    streak += 1;
  }
  return streak;
}

export function blockedLaunchRefusal(launches: SettledLaunch[]): string | undefined {
  const streak = blockedLaunchStreak(launches);
  if (streak < BLOCKED_LAUNCH_LIMIT) {
    return undefined;
  }
  return `${streak} runs in a row ended without clearing what blocked them, and nothing has been asked of the user in between — starting another would repeat them. Ask the user what must change instead.`;
}

function clearedNothing(status: SettledLaunch["status"]): boolean {
  return status === "needs_attention" || status === "failed";
}

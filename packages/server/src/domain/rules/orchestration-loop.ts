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

export const TEAM_CHANGE_QUESTION = "You proposed a change to the project's team.";

export const TEAM_CHANGE_APPROVED =
  "The owner approved it. team.md now reads as you proposed and is committed, and it holds for " +
  "every later run. Decide the next step, picking a flow from the new team.";

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

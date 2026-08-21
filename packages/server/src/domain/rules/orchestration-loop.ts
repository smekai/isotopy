import type { Orchestration, OrchestratorAction, RunState } from "@isotopy/core";

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

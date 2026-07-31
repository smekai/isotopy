import { isTerminalRunStatus } from "@adhd/core";
import type { RunSummary } from "@adhd/core";

export function mergeSummary(runs: RunSummary[], summary: RunSummary): RunSummary[] {
  const index = runs.findIndex((run) => run.id === summary.id);
  if (index === -1) {
    return [summary, ...runs];
  }
  const next = [...runs];
  next[index] = summary;
  return next;
}

export function mergeSummaries(runs: RunSummary[], updates: RunSummary[]): RunSummary[] {
  return updates.reduce(mergeSummary, runs);
}

export function firstActiveRunId(runs: RunSummary[]): string | null {
  return runs.find((run) => !isTerminalRunStatus(run.status))?.id ?? null;
}

export function runsForFeature(runs: RunSummary[], featureId: string): RunSummary[] {
  return runs.filter((run) => run.featureId === featureId);
}

export function milestoneRefreshKey(runs: RunSummary[]): string {
  return runs
    .filter((run) => run.milestoneId !== undefined)
    .map((run) => `${run.id}:${run.status}`)
    .sort()
    .join("|");
}

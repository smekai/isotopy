import { isTerminalRunStatus } from "@isotopy/core";
import type { Orchestration, RunSummary } from "@isotopy/core";

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

export function runsForOrchestration(
  runs: RunSummary[],
  orchestration: Orchestration,
): RunSummary[] {
  const owned = new Set(orchestration.runIds);
  return runs
    .filter((run) => owned.has(run.id))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function orchestrationRefreshKey(runs: RunSummary[]): string {
  return runs
    .filter((run) => run.orchestrationId !== undefined)
    .map((run) => `${run.id}:${run.status}:${run.stages.map((stage) => stage.status).join(",")}`)
    .sort()
    .join("|");
}

export type RailItem =
  | { kind: "run"; run: RunSummary }
  | { kind: "initiative"; orchestration: Orchestration; runs: RunSummary[] };

interface GatheredInitiative {
  orchestration: Orchestration;
  runs: RunSummary[];
}

function newestAt(item: RailItem): string {
  return item.kind === "run" ? item.run.createdAt : (item.runs.at(-1)?.createdAt ?? "");
}

export function railItems(
  runs: RunSummary[],
  orchestrations: Orchestration[],
): RailItem[] {
  const known = new Map(orchestrations.map((entry) => [entry.id, entry]));
  const gathered = new Map<string, GatheredInitiative>();
  const items: RailItem[] = [];

  for (const run of runs) {
    const owner = run.orchestrationId === undefined ? undefined : known.get(run.orchestrationId);
    if (owner === undefined) {
      items.push({ kind: "run", run });
      continue;
    }
    const initiative = gathered.get(owner.id) ?? { orchestration: owner, runs: [] };
    initiative.runs.push(run);
    gathered.set(owner.id, initiative);
  }

  for (const initiative of gathered.values()) {
    items.push({
      kind: "initiative",
      orchestration: initiative.orchestration,
      runs: [...initiative.runs].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    });
  }

  return items.sort((a, b) => newestAt(b).localeCompare(newestAt(a)));
}

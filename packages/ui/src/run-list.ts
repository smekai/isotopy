import { isTerminalRunStatus } from "@isotopy/core";
import type { Orchestration, RunSummary, ScheduleView } from "@isotopy/core";

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

export function runsForSchedule(
  runs: RunSummary[],
  orchestrations: Orchestration[],
  scheduleId: string,
): RunSummary[] {
  const episodes = new Set(
    orchestrations
      .filter((orchestration) => orchestration.scheduleId === scheduleId)
      .map((orchestration) => orchestration.id),
  );
  return runs
    .filter((run) => run.orchestrationId !== undefined && episodes.has(run.orchestrationId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function orchestrationRefreshKey(runs: RunSummary[]): string {
  return runs
    .filter((run) => run.orchestrationId !== undefined)
    .map((run) => `${run.id}:${run.status}:${run.stages.map((stage) => stage.status).join(",")}`)
    .sort()
    .join("|");
}

export const SCHEDULE_GROUP_RUNS = 5;

export type RailItem =
  | { kind: "run"; run: RunSummary }
  | { kind: "initiative"; orchestration: Orchestration; runs: RunSummary[] }
  | { kind: "schedule"; schedule: ScheduleView; runs: RunSummary[]; totalRuns: number };

interface GatheredInitiative {
  orchestration: Orchestration;
  runs: RunSummary[];
}

interface GatheredSchedule {
  schedule: ScheduleView;
  runs: RunSummary[];
}

function newestAt(item: RailItem): string {
  return item.kind === "run" ? item.run.createdAt : (item.runs.at(-1)?.createdAt ?? "");
}

function byCreatedAt(runs: RunSummary[]): RunSummary[] {
  return [...runs].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function railItems(
  runs: RunSummary[],
  orchestrations: Orchestration[],
  schedules: ScheduleView[] = [],
): RailItem[] {
  const known = new Map(orchestrations.map((entry) => [entry.id, entry]));
  const standing = new Map(schedules.map((entry) => [entry.id, entry]));
  const initiatives = new Map<string, GatheredInitiative>();
  const recurring = new Map<string, GatheredSchedule>();
  const items: RailItem[] = [];

  for (const run of runs) {
    const owner = run.orchestrationId === undefined ? undefined : known.get(run.orchestrationId);
    if (owner === undefined) {
      items.push({ kind: "run", run });
      continue;
    }
    const schedule = owner.scheduleId === undefined ? undefined : standing.get(owner.scheduleId);
    if (schedule === undefined) {
      const initiative = initiatives.get(owner.id) ?? { orchestration: owner, runs: [] };
      initiative.runs.push(run);
      initiatives.set(owner.id, initiative);
      continue;
    }
    const group = recurring.get(schedule.id) ?? { schedule, runs: [] };
    group.runs.push(run);
    recurring.set(schedule.id, group);
  }

  for (const initiative of initiatives.values()) {
    items.push({
      kind: "initiative",
      orchestration: initiative.orchestration,
      runs: byCreatedAt(initiative.runs),
    });
  }

  for (const group of recurring.values()) {
    items.push({
      kind: "schedule",
      schedule: group.schedule,
      runs: byCreatedAt(group.runs).slice(-SCHEDULE_GROUP_RUNS),
      totalRuns: group.runs.length,
    });
  }

  return items.sort((a, b) => newestAt(b).localeCompare(newestAt(a)));
}

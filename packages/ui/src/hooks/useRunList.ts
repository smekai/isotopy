import { toRunSummary } from "@isotopy/core";
import type { RunSummary } from "@isotopy/core";
import { fetchRuns, subscribeRunSummaries } from "../api";
import { useProjectCollection } from "./useProjectCollection";

export interface RunListController {
  runs: RunSummary[];
  ready: boolean;
  error: string | null;
}

export function useRunList(projectId: string, enabled: boolean): RunListController {
  const { items, ready, error } = useProjectCollection<RunSummary>({
    projectId,
    enabled,
    load: loadRunSummaries,
    subscribe: subscribeRunSummaries,
    failure: "Failed to load runs",
  });
  return { runs: items, ready, error };
}

async function loadRunSummaries(): Promise<RunSummary[]> {
  return (await fetchRuns()).map(toRunSummary);
}

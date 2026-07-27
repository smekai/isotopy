import { useEffect, useState } from "react";
import { toRunSummary } from "@adhd/core";
import type { RunSummary } from "@adhd/core";
import { fetchRuns, subscribeRunSummaries } from "../api";
import { mergeSummaries, mergeSummary } from "../run-list";

export interface RunListController {
  runs: RunSummary[];
  ready: boolean;
  error: string | null;
}

export function useRunList(projectId: string, enabled: boolean): RunListController {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let cancelled = false;
    let buffered: RunSummary[] = [];
    let loaded = false;
    setReady(false);
    setRuns([]);

    const unsubscribe = subscribeRunSummaries(projectId, (summary) => {
      if (cancelled) {
        return;
      }
      if (!loaded) {
        buffered.push(summary);
        return;
      }
      setRuns((current) => mergeSummary(current, summary));
    });

    void fetchRuns()
      .then((snapshot) => {
        if (cancelled) {
          return;
        }
        setRuns(mergeSummaries(snapshot.map(toRunSummary), buffered));
        buffered = [];
        loaded = true;
        setReady(true);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) {
          return;
        }
        loaded = true;
        setReady(true);
        setError(err instanceof Error ? err.message : "Failed to load runs");
      });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [projectId, enabled]);

  return { runs, ready, error };
}

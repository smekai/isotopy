import { useEffect, useState } from "react";
import type { RunEvent, RunState } from "@adhd/core";
import { fetchRun, subscribeRunEvents } from "../api";

function applyEvent(run: RunState, event: RunEvent): RunState {
  const next = structuredClone(run);

  if (event.type === "run.started") {
    next.status = "running";
  }

  if (event.type === "run.completed") {
    next.status = event.status === "failed" ? "failed" : "completed";
    next.completedAt = event.ts;
  }

  if (!event.stageId) {
    return next;
  }

  const stage = next.stages.find((item) => item.id === event.stageId);
  if (!stage) {
    return next;
  }

  if (event.type === "stage.started") {
    stage.status = "running";
    stage.startedAt = event.ts;
  }

  if (event.type === "stage.log" && event.message) {
    stage.logs.push(event.message);
  }

  if (event.type === "stage.completed") {
    stage.status = "passed";
    stage.completedAt = event.ts;
  }

  if (event.type === "stage.failed") {
    stage.status = "failed";
    stage.completedAt = event.ts;
    if (event.message) {
      stage.logs.push(event.message);
    }
  }

  return next;
}

export function useRunEvents(runId: string | null) {
  const [run, setRun] = useState<RunState | null>(null);
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!runId) {
      setRun(null);
      setEvents([]);
      setError(null);
      return;
    }

    let cancelled = false;

    void fetchRun(runId)
      .then((initial) => {
        if (!cancelled) {
          setRun(initial);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load run");
        }
      });

    const unsubscribe = subscribeRunEvents(runId, (event) => {
      setEvents((current) => [...current, event]);
      setRun((current) => (current ? applyEvent(current, event) : current));
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [runId]);

  return { run, events, error };
}

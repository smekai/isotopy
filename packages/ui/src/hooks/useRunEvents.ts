import { useEffect, useState } from "react";
import type { RunEvent, RunState, RunStatus } from "@adhd/core";
import { fetchRun, subscribeRunEvents } from "../api";

const TERMINAL_RUN_STATUSES: RunStatus[] = ["completed", "failed", "cancelled"];

function applyEvent(run: RunState, event: RunEvent): RunState {
  const next = structuredClone(run);

  if (event.type === "run.started") {
    next.status = "running";
    next.completedAt = undefined;
  }

  if (event.type === "run.completed") {
    next.status =
      event.status === "failed" || event.status === "cancelled"
        ? event.status
        : "completed";
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
    stage.completedAt = undefined;
  }

  if (event.type === "stage.log" && event.message) {
    const duplicate = stage.logs.some(
      (entry) => entry.ts === event.ts && entry.message === event.message,
    );
    if (!duplicate) {
      stage.logs.push({
        ts: event.ts,
        level: event.level ?? "info",
        message: event.message,
      });
    }
  }

  if (event.type === "stage.completed") {
    stage.status = "passed";
    stage.completedAt = event.ts;
  }

  if (event.type === "stage.failed") {
    stage.status = "failed";
    stage.completedAt = event.ts;
  }

  if (event.type === "stage.awaiting") {
    stage.status = "awaiting";
    next.status = "awaiting";
  }

  if (event.type === "stage.approved") {
    stage.status = "passed";
    stage.completedAt = event.ts;
    next.status = "running";
  }

  if (event.type === "stage.skipped") {
    stage.status = "skipped";
  }

  return next;
}

export function useRunEvents(runId: string | null, resubscribeKey = 0) {
  const [run, setRun] = useState<RunState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!runId) {
      setRun(null);
      setError(null);
      return;
    }

    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    let buffered: RunEvent[] = [];
    let ready = false;

    const stop = () => {
      unsubscribe?.();
      unsubscribe = undefined;
    };

    // Subscribe before the initial fetch so no events are lost; buffer until
    // the initial state arrives (the log dedupe in applyEvent absorbs overlap).
    unsubscribe = subscribeRunEvents(runId, (event) => {
      if (cancelled) {
        return;
      }
      if (!ready) {
        buffered.push(event);
        return;
      }
      setRun((current) => (current ? applyEvent(current, event) : current));
      if (event.type === "run.completed") {
        // Stop before the server closes the stream, or EventSource reconnects forever.
        stop();
      }
    });

    void fetchRun(runId)
      .then((initial) => {
        if (cancelled) {
          return;
        }
        let state = initial;
        for (const event of buffered) {
          state = applyEvent(state, event);
        }
        buffered = [];
        ready = true;
        setRun(state);
        setError(null);
        if (TERMINAL_RUN_STATUSES.includes(state.status)) {
          stop();
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load run");
        }
      });

    return () => {
      cancelled = true;
      stop();
    };
  }, [runId, resubscribeKey]);

  return { run, error };
}

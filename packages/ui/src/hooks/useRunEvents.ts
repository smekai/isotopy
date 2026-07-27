import { useEffect, useState } from "react";
import { isTerminalRunStatus } from "@adhd/core";
import type { RunEvent, RunState } from "@adhd/core";
import { fetchRun, subscribeRunEvents } from "../api";
import { applyEvent } from "../run-events";

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
        if (isTerminalRunStatus(state.status)) {
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

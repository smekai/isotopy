// Substitutes the two api.ts calls useRunEvents depends on — the run snapshot
// and the SSE subscription — so a test can control their *ordering*, which is
// the whole point of the hook. AAAAA forbids branching in a test body, so the
// deferred promises, the listener bookkeeping and the act() wrapping live here.
import { act } from "@testing-library/react";
import { vi } from "vitest";
import type { RunEvent, RunState } from "@adhd/core";
import { fetchRun, subscribeRunEvents } from "../../src/api";
import { deferred, last } from "./deferred";
import type { Deferred } from "./deferred";

export interface FakeRunStream {
  /** Resolve the snapshot request the hook is currently waiting on. */
  snapshot(state: RunState): Promise<void>;
  /** Reject it instead, as a failed GET /runs/:id would. */
  failSnapshot(message: string): Promise<void>;
  /** Push an event through the live SSE callback. */
  emit(event: RunEvent): Promise<void>;
  subscribeCount(): number;
  unsubscribeCount(): number;
  subscribedRunIds(): string[];
}

export function fakeRunStream(): FakeRunStream {
  const snapshots: Deferred<RunState>[] = [];
  const listeners: ((event: RunEvent) => void)[] = [];
  const runIds: string[] = [];
  let unsubscribes = 0;

  vi.mocked(fetchRun).mockImplementation(() => {
    const next = deferred<RunState>();
    snapshots.push(next);
    return next.promise;
  });

  vi.mocked(subscribeRunEvents).mockImplementation((runId, onEvent) => {
    runIds.push(runId);
    listeners.push(onEvent);
    return () => {
      unsubscribes += 1;
    };
  });

  return {
    async snapshot(state) {
      await act(async () => {
        last(snapshots, "useRunEvents").resolve(state);
      });
    },
    async failSnapshot(message) {
      await act(async () => {
        last(snapshots, "useRunEvents").reject(new Error(message));
      });
    },
    async emit(event) {
      await act(async () => {
        last(listeners, "useRunEvents")(event);
      });
    },
    subscribeCount: () => listeners.length,
    unsubscribeCount: () => unsubscribes,
    subscribedRunIds: () => [...runIds],
  };
}

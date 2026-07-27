// Substitutes the two api.ts calls useRunEvents depends on — the run snapshot
// and the SSE subscription — so a test can control their *ordering*, which is
// the whole point of the hook. AAAAA forbids branching in a test body, so the
// deferred promises, the listener bookkeeping and the act() wrapping live here.
import { act } from "@testing-library/react";
import { vi } from "vitest";
import type { RunEvent, RunState } from "@adhd/core";
import { fetchRun, subscribeRunEvents } from "../../src/api";

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(reason: Error): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function last<T>(items: T[]): T {
  const item = items[items.length - 1];
  if (item === undefined) {
    throw new Error("useRunEvents has not called the api yet");
  }
  return item;
}

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
        last(snapshots).resolve(state);
      });
    },
    async failSnapshot(message) {
      await act(async () => {
        last(snapshots).reject(new Error(message));
      });
    },
    async emit(event) {
      await act(async () => {
        last(listeners)(event);
      });
    },
    subscribeCount: () => listeners.length,
    unsubscribeCount: () => unsubscribes,
    subscribedRunIds: () => [...runIds],
  };
}

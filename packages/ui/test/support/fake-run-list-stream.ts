// Substitutes the two api.ts calls useRunList depends on — the run snapshot and
// the project SSE subscription — so a test can control their ordering. AAAAA
// forbids branching in a test body, so the deferred promises, the listener
// bookkeeping and the act() wrapping live here.
import { act } from "@testing-library/react";
import { vi } from "vitest";
import type { RunState, RunSummary } from "@isotopy/core";
import { fetchRuns, subscribeRunSummaries } from "../../src/api";
import { deferred, last } from "./deferred";
import type { Deferred } from "./deferred";

export interface FakeRunListStream {
  /** Resolve the GET /runs request the hook is currently waiting on. */
  snapshot(runs: RunState[]): Promise<void>;
  /** Reject it instead, as a failed GET /runs would. */
  failSnapshot(message: string): Promise<void>;
  /** Push a summary through the live SSE callback. */
  push(summary: RunSummary): Promise<void>;
  subscribeCount(): number;
  unsubscribeCount(): number;
  subscribedProjectIds(): string[];
}

export function fakeRunListStream(): FakeRunListStream {
  const snapshots: Deferred<RunState[]>[] = [];
  const listeners: ((summary: RunSummary) => void)[] = [];
  const projectIds: string[] = [];
  let unsubscribes = 0;

  vi.mocked(fetchRuns).mockImplementation(() => {
    const next = deferred<RunState[]>();
    snapshots.push(next);
    return next.promise;
  });

  vi.mocked(subscribeRunSummaries).mockImplementation((projectId, onSummary) => {
    projectIds.push(projectId);
    listeners.push(onSummary);
    return () => {
      unsubscribes += 1;
    };
  });

  return {
    async snapshot(runs) {
      await act(async () => {
        last(snapshots, "useRunList").resolve(runs);
      });
    },
    async failSnapshot(message) {
      await act(async () => {
        last(snapshots, "useRunList").reject(new Error(message));
      });
    },
    async push(summary) {
      await act(async () => {
        last(listeners, "useRunList")(summary);
      });
    },
    subscribeCount: () => listeners.length,
    unsubscribeCount: () => unsubscribes,
    subscribedProjectIds: () => [...projectIds],
  };
}

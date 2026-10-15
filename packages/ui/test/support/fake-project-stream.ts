// Substitutes the two api.ts calls a project collection depends on — its snapshot
// and its subscription to the project stream — so a test can control their
// ordering. AAAAA forbids branching in a test body, so the deferred promises, the
// listener bookkeeping and the act() wrapping live here.
import { act } from "@testing-library/react";
import { vi } from "vitest";
import { deferred, last } from "./deferred";
import type { Deferred } from "./deferred";

export interface FakeProjectStream<Snapshot, Update> {
  /** Resolve the snapshot request the hook is currently waiting on. */
  snapshot(items: Snapshot[]): Promise<void>;
  /** Reject it instead, as a failed request would. */
  failSnapshot(message: string): Promise<void>;
  /** Push an update through the live subscription callback. */
  push(update: Update): Promise<void>;
  subscribeCount(): number;
  unsubscribeCount(): number;
  subscribedProjectIds(): string[];
}

export function fakeProjectStream<Snapshot, Update>(
  load: () => Promise<Snapshot[]>,
  subscribe: (projectId: string, onUpdate: (update: Update) => void) => () => void,
): FakeProjectStream<Snapshot, Update> {
  const snapshots: Deferred<Snapshot[]>[] = [];
  const listeners: ((update: Update) => void)[] = [];
  const projectIds: string[] = [];
  let unsubscribes = 0;

  vi.mocked(load).mockImplementation(() => {
    const next = deferred<Snapshot[]>();
    snapshots.push(next);
    return next.promise;
  });

  vi.mocked(subscribe).mockImplementation((projectId, onUpdate) => {
    projectIds.push(projectId);
    listeners.push(onUpdate);
    return () => {
      unsubscribes += 1;
    };
  });

  return {
    async snapshot(items) {
      await act(async () => {
        last(snapshots, "the hook's snapshot").resolve(items);
      });
    },
    async failSnapshot(message) {
      await act(async () => {
        last(snapshots, "the hook's snapshot").reject(new Error(message));
      });
    },
    async push(update) {
      await act(async () => {
        last(listeners, "the hook's subscription")(update);
      });
    },
    subscribeCount: () => listeners.length,
    unsubscribeCount: () => unsubscribes,
    subscribedProjectIds: () => [...projectIds],
  };
}

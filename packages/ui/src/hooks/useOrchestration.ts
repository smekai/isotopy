import { useCallback, useEffect, useRef, useState } from "react";
import type { Orchestration, RunState } from "@adhd/core";
import {
  approveOrchestratorTeam,
  fetchOrchestrations,
  startOrchestration,
  stopOrchestration,
} from "../api";
import type { ApproveTeamOptions, OrchestrationRunOptions } from "../api";

export interface OrchestrationController {
  orchestrations: Orchestration[];
  ready: boolean;
  error: string | null;
  busy: boolean;
  find(orchestrationId: string): Orchestration | undefined;
  start(goal: string, options: OrchestrationRunOptions): Promise<RunState | undefined>;
  approveTeam(
    orchestrationId: string,
    options: ApproveTeamOptions,
  ): Promise<RunState | undefined>;
  stop(orchestrationId: string): Promise<void>;
}

function messageOf(reason: unknown, fallback: string): string {
  return reason instanceof Error ? reason.message : fallback;
}

export function useOrchestration(
  projectId: string,
  enabled: boolean,
  refreshKey: string,
): OrchestrationController {
  const [orchestrations, setOrchestrations] = useState<Orchestration[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const loadedProject = useRef<string | null>(null);

  function forgetPreviousProject() {
    setOrchestrations([]);
    setReady(false);
    setError(null);
  }

  useEffect(() => {
    if (!enabled) {
      return;
    }
    if (loadedProject.current !== projectId) {
      loadedProject.current = projectId;
      forgetPreviousProject();
    }
    let cancelled = false;
    void fetchOrchestrations()
      .then((loaded) => {
        if (!cancelled) {
          setOrchestrations(loaded);
          setError(null);
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(messageOf(reason, "Failed to load orchestrations"));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, enabled, refreshKey]);

  const reload = useCallback(async () => {
    try {
      setOrchestrations(await fetchOrchestrations());
    } catch (reason) {
      setError(messageOf(reason, "Failed to refresh orchestrations"));
    }
  }, []);

  const act = useCallback(
    async <T>(operation: () => Promise<T>, fallback: string): Promise<T | undefined> => {
      setError(null);
      setBusy(true);
      try {
        const value = await operation();
        await reload();
        return value;
      } catch (reason) {
        setError(messageOf(reason, fallback));
        return undefined;
      } finally {
        setBusy(false);
      }
    },
    [reload],
  );

  const start = useCallback(
    (goal: string, options: OrchestrationRunOptions) =>
      act(
        () => startOrchestration({ ...options, goal }),
        "Failed to start the Orchestrator",
      ),
    [act],
  );

  const approveTeam = useCallback(
    (orchestrationId: string, options: ApproveTeamOptions) =>
      act(
        () => approveOrchestratorTeam(orchestrationId, options),
        "Failed to approve the team",
      ),
    [act],
  );

  const stop = useCallback(
    async (orchestrationId: string) => {
      await act(() => stopOrchestration(orchestrationId), "Failed to stop the Orchestrator");
    },
    [act],
  );

  const find = useCallback(
    (orchestrationId: string) =>
      orchestrations.find((entry) => entry.id === orchestrationId),
    [orchestrations],
  );

  return { orchestrations, ready, error, busy, find, start, approveTeam, stop };
}

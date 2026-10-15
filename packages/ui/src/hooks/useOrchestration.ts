import { useCallback, useState } from "react";
import type { Orchestration, RunState } from "@isotopy/core";
import {
  approveOrchestratorTeam,
  fetchOrchestrations,
  startOrchestration,
  stopOrchestration,
  subscribeOrchestrations,
} from "../api";
import type { ApproveTeamOptions, OrchestrationRunOptions } from "../api";
import { messageOf, useProjectCollection } from "./useProjectCollection";

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

export function useOrchestration(projectId: string, enabled: boolean): OrchestrationController {
  const { items: orchestrations, ready, error, setError } = useProjectCollection<Orchestration>({
    projectId,
    enabled,
    load: fetchOrchestrations,
    subscribe: subscribeOrchestrations,
    failure: "Failed to load orchestrations",
  });
  const [busy, setBusy] = useState(false);

  const act = useCallback(
    async <T>(operation: () => Promise<T>, fallback: string): Promise<T | undefined> => {
      setError(null);
      setBusy(true);
      try {
        return await operation();
      } catch (reason) {
        setError(messageOf(reason, fallback));
        return undefined;
      } finally {
        setBusy(false);
      }
    },
    [setError],
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

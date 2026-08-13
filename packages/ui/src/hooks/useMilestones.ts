import { useCallback, useEffect, useRef, useState } from "react";
import type { Milestone, RunState } from "@isotopy/core";
import {
  acceptMilestoneFeature,
  fetchMilestones,
  finalizeMilestone,
  startNextMilestoneRun,
  updateMilestone,
} from "../api";
import type { StartRunOptions } from "../api";

export type StartNextOptions = Omit<StartRunOptions, "pipelineId" | "task">;

export interface MilestonesController {
  milestones: Milestone[];
  ready: boolean;
  error: string | null;
  find(milestoneId: string): Milestone | undefined;
  setAutoRunNext(milestoneId: string, autoRunNext: boolean): Promise<void>;
  startNext(
    milestoneId: string,
    options: StartNextOptions,
  ): Promise<RunState | undefined>;
  acceptFeature(milestoneId: string, featureId: string): Promise<void>;
  finalize(milestoneId: string): Promise<void>;
}

function messageOf(reason: unknown, fallback: string): string {
  return reason instanceof Error ? reason.message : fallback;
}

export function useMilestones(
  projectId: string,
  enabled: boolean,
  refreshKey: string,
): MilestonesController {
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadedProject = useRef<string | null>(null);

  function forgetPreviousProject() {
    setMilestones([]);
    setReady(false);
    setError(null);
  }

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const switchedProject = loadedProject.current !== projectId;
    if (switchedProject) {
      loadedProject.current = projectId;
      forgetPreviousProject();
    }
    let cancelled = false;
    void fetchMilestones()
      .then((loaded) => {
        if (!cancelled) {
          setMilestones(loaded);
          setError(null);
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(messageOf(reason, "Failed to load milestones"));
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

  const replace = useCallback((updated: Milestone) => {
    setMilestones((current) =>
      current.map((entry) => (entry.id === updated.id ? updated : entry)),
    );
    setError(null);
  }, []);

  const reload = useCallback(async () => {
    try {
      setMilestones(await fetchMilestones());
    } catch (reason) {
      setError(messageOf(reason, "Failed to refresh milestones"));
    }
  }, []);

  const showAutoRunNextBeforeItIsSaved = useCallback(
    (milestoneId: string, autoRunNext: boolean) => {
      setMilestones((current) =>
        current.map((entry) =>
          entry.id === milestoneId ? { ...entry, autoRunNext } : entry,
        ),
      );
    },
    [],
  );

  const setAutoRunNext = useCallback(
    async (milestoneId: string, autoRunNext: boolean) => {
      setError(null);
      showAutoRunNextBeforeItIsSaved(milestoneId, autoRunNext);
      try {
        replace(await updateMilestone(milestoneId, { autoRunNext }));
      } catch (reason) {
        await reload();
        setError(messageOf(reason, "Failed to update the milestone"));
      }
    },
    [replace, reload, showAutoRunNextBeforeItIsSaved],
  );

  const startNext = useCallback(
    async (milestoneId: string, options: StartNextOptions) => {
      setError(null);
      try {
        const run = await startNextMilestoneRun(milestoneId, options);
        await reload();
        return run;
      } catch (reason) {
        setError(messageOf(reason, "Failed to start the next feature"));
        return undefined;
      }
    },
    [reload],
  );

  const acceptFeature = useCallback(
    async (milestoneId: string, featureId: string) => {
      try {
        replace(await acceptMilestoneFeature(milestoneId, featureId));
      } catch (reason) {
        setError(messageOf(reason, "Failed to accept the feature"));
      }
    },
    [replace],
  );

  const finalize = useCallback(
    async (milestoneId: string) => {
      try {
        replace(await finalizeMilestone(milestoneId));
      } catch (reason) {
        setError(messageOf(reason, "Failed to finalize the milestone"));
      }
    },
    [replace],
  );

  const find = useCallback(
    (milestoneId: string) =>
      milestones.find((entry) => entry.id === milestoneId),
    [milestones],
  );

  return {
    milestones,
    ready,
    error,
    find,
    setAutoRunNext,
    startNext,
    acceptFeature,
    finalize,
  };
}

import { useCallback, useEffect, useRef, useState } from "react";
import type { ScheduleView, UpdateScheduleInput } from "@isotopy/core";
import {
  createSchedule,
  deleteSchedule,
  fetchSchedules,
  updateSchedule,
} from "../api";
import type { CreateScheduleBody } from "../api";

export interface SchedulesController {
  schedules: ScheduleView[];
  ready: boolean;
  error: string | null;
  find(scheduleId: string): ScheduleView | undefined;
  create(body: CreateScheduleBody): Promise<ScheduleView | undefined>;
  update(scheduleId: string, patch: UpdateScheduleInput): Promise<void>;
  remove(scheduleId: string): Promise<void>;
}

function messageOf(reason: unknown, fallback: string): string {
  return reason instanceof Error ? reason.message : fallback;
}

export function useSchedules(projectId: string, enabled: boolean): SchedulesController {
  const [schedules, setSchedules] = useState<ScheduleView[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadedProject = useRef<string | null>(null);

  function forgetPreviousProject() {
    setSchedules([]);
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
    void fetchSchedules()
      .then((loaded) => {
        if (!cancelled) {
          setSchedules(loaded);
          setError(null);
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(messageOf(reason, "Failed to load schedules"));
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
  }, [projectId, enabled]);

  const replace = useCallback((updated: ScheduleView) => {
    setSchedules((current) =>
      current.map((entry) => (entry.id === updated.id ? updated : entry)),
    );
    setError(null);
  }, []);

  const create = useCallback(async (body: CreateScheduleBody) => {
    setError(null);
    try {
      const created = await createSchedule(body);
      setSchedules((current) => [...current, created]);
      return created;
    } catch (reason) {
      setError(messageOf(reason, "Failed to create the schedule"));
      return undefined;
    }
  }, []);

  const update = useCallback(
    async (scheduleId: string, patch: UpdateScheduleInput) => {
      try {
        replace(await updateSchedule(scheduleId, patch));
      } catch (reason) {
        setError(messageOf(reason, "Failed to update the schedule"));
      }
    },
    [replace],
  );

  const remove = useCallback(async (scheduleId: string) => {
    try {
      await deleteSchedule(scheduleId);
      setSchedules((current) => current.filter((entry) => entry.id !== scheduleId));
      setError(null);
    } catch (reason) {
      setError(messageOf(reason, "Failed to delete the schedule"));
    }
  }, []);

  const find = useCallback(
    (scheduleId: string) => schedules.find((entry) => entry.id === scheduleId),
    [schedules],
  );

  return { schedules, ready, error, find, create, update, remove };
}

import { useCallback, useEffect, useRef, useState } from "react";
import type { ScheduleView, UpdateScheduleInput } from "@isotopy/core";
import { SCHEDULE_TICK_MS } from "@isotopy/core";
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
  update(scheduleId: string, patch: UpdateScheduleInput): Promise<boolean>;
  remove(scheduleId: string): Promise<boolean>;
}

function messageOf(reason: unknown, fallback: string): string {
  return reason instanceof Error ? reason.message : fallback;
}

export function useSchedules(projectId: string, enabled: boolean): SchedulesController {
  const [schedules, setSchedules] = useState<ScheduleView[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadedProject = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    if (loadedProject.current !== projectId) {
      loadedProject.current = projectId;
      setSchedules([]);
      setReady(false);
      setError(null);
    }
    let cancelled = false;
    // The ticker fires without any run event a skipped window could ride on, so
    // the only way this state stays true is to ask again on the ticker's cadence.
    const load = () =>
      fetchSchedules()
        .then((loaded) => {
          if (!cancelled) {
            setSchedules(loaded);
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
    void load();
    const poll = setInterval(() => void load(), SCHEDULE_TICK_MS);
    return () => {
      cancelled = true;
      clearInterval(poll);
    };
  }, [projectId, enabled]);

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

  const update = useCallback(async (scheduleId: string, patch: UpdateScheduleInput) => {
    setError(null);
    try {
      const updated = await updateSchedule(scheduleId, patch);
      setSchedules((current) =>
        current.map((entry) => (entry.id === updated.id ? updated : entry)),
      );
      return true;
    } catch (reason) {
      setError(messageOf(reason, "Failed to update the schedule"));
      return false;
    }
  }, []);

  const remove = useCallback(async (scheduleId: string) => {
    setError(null);
    try {
      await deleteSchedule(scheduleId);
      setSchedules((current) => current.filter((entry) => entry.id !== scheduleId));
      return true;
    } catch (reason) {
      setError(messageOf(reason, "Failed to delete the schedule"));
      return false;
    }
  }, []);

  const find = useCallback(
    (scheduleId: string) => schedules.find((entry) => entry.id === scheduleId),
    [schedules],
  );

  return { schedules, ready, error, find, create, update, remove };
}

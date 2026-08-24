import { useCallback } from "react";
import type { CreateScheduleInput, ScheduleView, UpdateScheduleInput } from "@isotopy/core";
import { SCHEDULE_TICK_MS } from "@isotopy/core";
import { createSchedule, deleteSchedule, fetchSchedules, updateSchedule } from "../api";
import { messageOf, useProjectCollection } from "./useProjectCollection";

export interface SchedulesController {
  schedules: ScheduleView[];
  ready: boolean;
  error: string | null;
  find(scheduleId: string): ScheduleView | undefined;
  create(body: CreateScheduleInput): Promise<ScheduleView | undefined>;
  update(scheduleId: string, patch: UpdateScheduleInput): Promise<boolean>;
  remove(scheduleId: string): Promise<boolean>;
}

export function useSchedules(projectId: string, enabled: boolean): SchedulesController {
  // A skipped window emits no run for SSE to carry, so asking again on the
  // ticker's cadence is the only thing that keeps this state true.
  const collection = useProjectCollection<ScheduleView>({
    projectId,
    enabled,
    load: fetchSchedules,
    failure: "Failed to load schedules",
    refreshMs: SCHEDULE_TICK_MS,
  });
  const { items: schedules, setItems, setError } = collection;

  const create = useCallback(
    async (body: CreateScheduleInput) => {
      setError(null);
      try {
        const created = await createSchedule(body);
        setItems((current) => [...current, created]);
        return created;
      } catch (reason) {
        setError(messageOf(reason, "Failed to create the schedule"));
        return undefined;
      }
    },
    [setItems, setError],
  );

  const update = useCallback(
    async (scheduleId: string, patch: UpdateScheduleInput) => {
      setError(null);
      try {
        const updated = await updateSchedule(scheduleId, patch);
        setItems((current) =>
          current.map((entry) => (entry.id === updated.id ? updated : entry)),
        );
        return true;
      } catch (reason) {
        setError(messageOf(reason, "Failed to update the schedule"));
        return false;
      }
    },
    [setItems, setError],
  );

  const remove = useCallback(
    async (scheduleId: string) => {
      setError(null);
      try {
        await deleteSchedule(scheduleId);
        setItems((current) => current.filter((entry) => entry.id !== scheduleId));
        return true;
      } catch (reason) {
        setError(messageOf(reason, "Failed to delete the schedule"));
        return false;
      }
    },
    [setItems, setError],
  );

  const find = useCallback(
    (scheduleId: string) => schedules.find((entry) => entry.id === scheduleId),
    [schedules],
  );

  return {
    schedules,
    ready: collection.ready,
    error: collection.error,
    find,
    create,
    update,
    remove,
  };
}

import type { Schedule } from "@isotopy/core";
import { scheduleAnchor } from "@isotopy/core";
import { isDueAt, nextRunAfter, recurrenceIssues } from "@isotopy/scheduler";
import type { ValidationIssue } from "../validation.ts";

export function nextFireForSchedule(schedule: Schedule): string | undefined {
  return nextRunAfter(schedule, scheduleAnchor(schedule));
}

export function scheduleIsDue(schedule: Schedule, now: string): boolean {
  return schedule.enabled && isDueAt(schedule, scheduleAnchor(schedule), now);
}

export function scheduleCronIssues(cron: string, timezone: string): ValidationIssue[] {
  return recurrenceIssues({ cron, timezone });
}

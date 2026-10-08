import type { Schedule } from "@isotopy/core";
import { nextRunAfter, recurrenceIssues } from "../../utils/recurrence.ts";
import type { ValidationIssue } from "../validation.ts";

export function nextFireForSchedule(schedule: Schedule, now: string): string | undefined {
  return nextRunAfter(schedule, now);
}

export function scheduleCronIssues(cron: string, timezone: string): ValidationIssue[] {
  return recurrenceIssues({ cron, timezone });
}

import { Cron } from "croner";
import type { Schedule } from "@isotopy/core";
import { scheduleAnchor } from "@isotopy/core";
import type { ValidationIssue } from "../validation.ts";

export function nextScheduleFire(schedule: Schedule, after: string): string | undefined {
  try {
    return new Cron(schedule.cron, { timezone: schedule.timezone })
      .nextRun(new Date(after))
      ?.toISOString();
  } catch {
    return undefined;
  }
}

export function nextFireForSchedule(schedule: Schedule): string | undefined {
  return nextScheduleFire(schedule, scheduleAnchor(schedule));
}

function timezoneIssues(timezone: string): ValidationIssue[] {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return [];
  } catch {
    return [
      {
        path: ["timezone"],
        message: `${timezone} is not an IANA time zone — try one like Europe/Berlin`,
      },
    ];
  }
}

function cronIssues(cron: string, timezone: string): ValidationIssue[] {
  try {
    return new Cron(cron, { timezone }).nextRun() === null
      ? [{ path: ["cron"], message: `${cron} never fires again` }]
      : [];
  } catch {
    return [
      {
        path: ["cron"],
        message: `${cron} is not a cron expression — five fields, like 0 9 * * *`,
      },
    ];
  }
}

export function scheduleCronIssues(cron: string, timezone: string): ValidationIssue[] {
  const zone = timezoneIssues(timezone);
  return zone.length > 0 ? zone : cronIssues(cron, timezone);
}

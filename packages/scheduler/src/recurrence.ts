import { Cron } from "croner";

export interface Recurrence {
  cron: string;
  timezone: string;
}

export interface RecurrenceIssue {
  path: (string | number)[];
  message: string;
}

export function nextRunAfter(recurrence: Recurrence, after: string): string | undefined {
  try {
    return new Cron(recurrence.cron, { timezone: recurrence.timezone })
      .nextRun(new Date(after))
      ?.toISOString();
  } catch {
    return undefined;
  }
}

export function isDueAt(recurrence: Recurrence, since: string, now: string): boolean {
  const next = nextRunAfter(recurrence, since);
  return next !== undefined && next <= now;
}

function timezoneIssues(timezone: string): RecurrenceIssue[] {
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

function cronIssues(recurrence: Recurrence): RecurrenceIssue[] {
  try {
    return new Cron(recurrence.cron, { timezone: recurrence.timezone }).nextRun() === null
      ? [{ path: ["cron"], message: `${recurrence.cron} never fires again` }]
      : [];
  } catch {
    return [
      {
        path: ["cron"],
        message: `${recurrence.cron} is not a cron expression — five fields, like 0 9 * * *`,
      },
    ];
  }
}

export function recurrenceIssues(recurrence: Recurrence): RecurrenceIssue[] {
  const zone = timezoneIssues(recurrence.timezone);
  return zone.length > 0 ? zone : cronIssues(recurrence);
}

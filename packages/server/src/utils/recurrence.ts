import { CronExpressionParser } from "cron-parser";

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
    return CronExpressionParser.parse(recurrence.cron, {
      currentDate: new Date(after),
      tz: recurrence.timezone,
    })
      .next()
      .toISOString() ?? undefined;
  } catch {
    return undefined;
  }
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
    CronExpressionParser.parse(recurrence.cron, { tz: recurrence.timezone }).next();
    return [];
  } catch {
    return [
      {
        path: ["cron"],
        message: `${recurrence.cron} is not a cron expression, or never fires again — five fields, like 0 9 * * *`,
      },
    ];
  }
}

export function recurrenceIssues(recurrence: Recurrence): RecurrenceIssue[] {
  const zone = timezoneIssues(recurrence.timezone);
  return zone.length > 0 ? zone : cronIssues(recurrence);
}

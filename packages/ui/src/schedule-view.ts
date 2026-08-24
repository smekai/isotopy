import type { ScheduleView } from "@isotopy/core";

const NEVER = "—";

const FIRE_FORMAT: Intl.DateTimeFormatOptions = {
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
};

export function scheduleStatusLabel(schedule: ScheduleView): string {
  return schedule.enabled ? "On" : "Paused";
}

export function formatNextFire(schedule: ScheduleView): string {
  if (!schedule.enabled || schedule.nextFireAt === undefined) {
    return NEVER;
  }
  return new Intl.DateTimeFormat(undefined, FIRE_FORMAT).format(new Date(schedule.nextFireAt));
}

export function scheduleFireEcho(schedule: ScheduleView): string {
  return schedule.enabled && schedule.nextFireAt !== undefined
    ? `Next run ${formatNextFire(schedule)}, your time`
    : "Paused — this schedule will not run";
}

export function lastOutcomeLabel(schedule: ScheduleView): string {
  const outcome = schedule.lastOutcome;
  if (outcome === undefined) {
    return "Has not run yet";
  }
  switch (outcome.kind) {
    case "fired":
      return "Last ran";
    case "skipped":
      return "Skipped — a run was already active";
    case "failed":
      return `Failed to start — ${outcome.error}`;
  }
}

export function scheduleFailed(schedule: ScheduleView): boolean {
  return schedule.lastOutcome?.kind === "failed";
}

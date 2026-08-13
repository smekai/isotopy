import type { RunLimit } from "@isotopy/core";

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;

export function formatCountdown(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(remainingMs / MS_PER_SECOND));
  const hours = Math.floor(totalSeconds / (SECONDS_PER_MINUTE * MINUTES_PER_HOUR));
  const minutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE) % MINUTES_PER_HOUR;
  const seconds = totalSeconds % SECONDS_PER_MINUTE;
  const padded = `${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
  return hours === 0 ? padded : `${hours}h ${padded}`;
}

export function formatResetAt(resetAt: string | undefined): string | undefined {
  if (resetAt === undefined) {
    return undefined;
  }
  const reset = new Date(resetAt);
  if (Number.isNaN(reset.getTime())) {
    return undefined;
  }
  return reset.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export function remainingMs(limit: RunLimit, now: number): number | undefined {
  if (limit.resetAt === undefined) {
    return undefined;
  }
  const reset = new Date(limit.resetAt).getTime();
  return Number.isNaN(reset) ? undefined : Math.max(0, reset - now);
}

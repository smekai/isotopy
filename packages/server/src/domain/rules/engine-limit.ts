import { DEFAULT_LIMIT_WAIT_MS, MAX_LIMIT_WAIT_MS } from "@isotopy/core";
import type { EngineId, EngineLimit, LimitResolution, ModelTier } from "@isotopy/core";

export interface RunEngineSelection {
  engine?: EngineId;
  model?: string;
  modelTier?: ModelTier;
}

const MINUTES_PER_DAY = 24 * 60;

const MS_PER_SECOND = 1000;

const MS_PER_MINUTE = 60 * MS_PER_SECOND;

const LIMIT_PATTERNS: Record<EngineId, RegExp> = {
  "claude-code": /session limit|usage limit/i,
  cursor: /usage limit|rate limit/i,
  codex: /rate limit|usage limit|usage_limit_reached/i,
};

const RESET_CLOCK =
  /reset(?:s|ting|ted)?\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?(?:\s*\(([^)]+)\))?/i;

const RESET_DELAY = /(?:try again|retry|reset(?:s)?|available again)\s+in\s+([^.,;)\n]+)/i;

const DELAY_UNITS = /(\d+)\s*(hours?|hrs?|minutes?|mins?|seconds?|secs?|h|m|s)\b/gi;

function unitMs(unit: string): number {
  const normalized = unit.toLowerCase();
  if (normalized.startsWith("h")) {
    return 60 * MS_PER_MINUTE;
  }
  return normalized.startsWith("m") ? MS_PER_MINUTE : MS_PER_SECOND;
}

function delayResetMs(raw: string): number | undefined {
  const phrase = RESET_DELAY.exec(raw)?.[1];
  if (phrase === undefined) {
    return undefined;
  }
  let total = 0;
  let matched = false;
  for (const [, count, unit] of phrase.matchAll(DELAY_UNITS)) {
    if (count === undefined || unit === undefined) {
      continue;
    }
    matched = true;
    total += Number(count) * unitMs(unit);
  }
  return matched ? total : undefined;
}

function readMinutesOfDay(parts: Intl.DateTimeFormatPart[]): number {
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);
  return Number.isNaN(hour) || Number.isNaN(minute) ? Number.NaN : hour * 60 + minute;
}

function minutesOfDayIn(now: Date, timeZone: string | undefined): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      hour: "2-digit",
      minute: "2-digit",
    }).formatToParts(now);
    const minutes = readMinutesOfDay(parts);
    if (!Number.isNaN(minutes)) {
      return minutes;
    }
  } catch {}
  return now.getHours() * 60 + now.getMinutes();
}

function targetMinutesOfDay(
  hour: number,
  minute: number,
  meridiem: string | undefined,
): number | undefined {
  if (minute > 59) {
    return undefined;
  }
  if (meridiem === undefined) {
    return hour > 23 ? undefined : hour * 60 + minute;
  }
  if (hour < 1 || hour > 12) {
    return undefined;
  }
  const hour24 = meridiem.toLowerCase() === "pm" ? (hour % 12) + 12 : hour % 12;
  return hour24 * 60 + minute;
}

function minutesUntil(target: number, current: number): number {
  return (((target - current) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}

function clockResetMs(raw: string, now: Date): number | undefined {
  const match = RESET_CLOCK.exec(raw);
  if (!match) {
    return undefined;
  }
  const [, hour, minute, meridiem, zone] = match;
  const target = targetMinutesOfDay(Number(hour), Number(minute ?? 0), meridiem);
  if (target === undefined) {
    return undefined;
  }
  const minutes = minutesUntil(target, minutesOfDayIn(now, zone?.trim()));
  return Math.max(minutes, 1) * MS_PER_MINUTE;
}

export function parseLimitResetMs(raw: string, now: Date = new Date()): number | undefined {
  const parsed = delayResetMs(raw) ?? clockResetMs(raw, now);
  if (parsed === undefined || parsed <= 0) {
    return undefined;
  }
  return Math.min(parsed, MAX_LIMIT_WAIT_MS);
}

export function detectEngineLimit(
  engine: EngineId,
  raw: string,
  now: Date = new Date(),
): EngineLimit | undefined {
  if (!LIMIT_PATTERNS[engine].test(raw)) {
    return undefined;
  }
  const waitMs = parseLimitResetMs(raw, now);
  if (waitMs === undefined) {
    return { raw };
  }
  return { raw, resetAt: new Date(now.getTime() + waitMs).toISOString() };
}

export function formatLimitWait(waitMs: number): string {
  const seconds = Math.max(1, Math.round(waitMs / MS_PER_SECOND));
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.round(seconds / 60);
  const hours = Math.floor(minutes / 60);
  return hours === 0 ? `${minutes}m` : `${hours}h ${minutes % 60}m`;
}

export function selectionAfterLimit(
  current: RunEngineSelection,
  resolution: LimitResolution,
): RunEngineSelection {
  if (resolution.choice === "switch-tier") {
    return { engine: current.engine, modelTier: resolution.tier };
  }
  if (resolution.choice === "switch-engine") {
    return { engine: resolution.engine, modelTier: current.modelTier };
  }
  return current;
}

export function limitWaitMs(limit: EngineLimit, now: Date = new Date()): number {
  if (limit.resetAt === undefined) {
    return DEFAULT_LIMIT_WAIT_MS;
  }
  const remaining = new Date(limit.resetAt).getTime() - now.getTime();
  if (!Number.isFinite(remaining) || remaining <= 0) {
    return DEFAULT_LIMIT_WAIT_MS;
  }
  return Math.min(remaining, MAX_LIMIT_WAIT_MS);
}

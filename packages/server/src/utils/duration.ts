const UNIT_MS = { ms: 1, s: 1000, m: 60_000, h: 3_600_000 } as const;

type DurationUnit = keyof typeof UNIT_MS;

export const DURATION_PATTERN = /^(\d+)(ms|s|m|h)$/;

export function parseDuration(text: string): number | undefined {
  const match = DURATION_PATTERN.exec(text.trim());
  if (match === null) {
    return undefined;
  }
  return Number(match[1]) * UNIT_MS[match[2] as DurationUnit];
}

export function formatDuration(ms: number): string {
  if (ms >= UNIT_MS.h && ms % UNIT_MS.h === 0) return `${ms / UNIT_MS.h}h`;
  if (ms >= UNIT_MS.m && ms % UNIT_MS.m === 0) return `${ms / UNIT_MS.m}m`;
  if (ms >= UNIT_MS.s && ms % UNIT_MS.s === 0) return `${ms / UNIT_MS.s}s`;
  return `${ms}ms`;
}

import { describe, expect, test } from "vitest";
import { DEFAULT_LIMIT_WAIT_MS } from "@adhd/core";
import {
  detectEngineLimit,
  formatLimitWait,
  limitWaitMs,
  parseLimitResetMs,
  selectionAfterLimit,
} from "../../src/domain/rules/engine-limit.ts";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

// The verbatim trigger from TASK-061, as Claude Code prints it.
const SESSION_LIMIT =
  "You've hit your session limit · resets 4:30pm (Europe/Tallinn)";

/** 2026-08-03T12:00:00Z is 15:00 in Tallinn (EEST, UTC+3) and 08:00 in New York. */
const NOON_UTC = new Date("2026-08-03T12:00:00.000Z");

describe("parseLimitResetMs", () => {
  test("reads a 12-hour clock in the named zone the CLI printed, not the server's", () => {
    expect(parseLimitResetMs(SESSION_LIMIT, NOON_UTC)).toBe(90 * MINUTE);
  });

  test("a zone west of the server yields a different duration for the same wall clock", () => {
    const raw = "You've hit your session limit · resets 4:30pm (America/New_York)";
    expect(parseLimitResetMs(raw, NOON_UTC)).toBe(8 * HOUR + 30 * MINUTE);
  });

  test("a reset earlier in the day than now rolls forward to tomorrow", () => {
    const raw = "usage limit reached, resets 2:00am (Europe/Tallinn)";
    expect(parseLimitResetMs(raw, NOON_UTC)).toBe(11 * HOUR);
  });

  test("a 24-hour clock without a zone is read against the server's own clock", () => {
    const local = new Date("2026-08-03T09:15:00");
    const raw = "rate limit reached — resets at 11:45";
    expect(parseLimitResetMs(raw, local)).toBe(2 * HOUR + 30 * MINUTE);
  });

  test("an explicit retry delay wins over clock parsing", () => {
    expect(parseLimitResetMs("usage limit — try again in 2h 15m", NOON_UTC)).toBe(
      2 * HOUR + 15 * MINUTE,
    );
  });

  test("an unparseable line yields no reset time rather than a guess", () => {
    expect(parseLimitResetMs("session limit reached", NOON_UTC)).toBeUndefined();
  });

  test("an unknown zone name falls back to the server clock instead of failing", () => {
    const local = new Date("2026-08-03T09:15:00");
    expect(parseLimitResetMs("resets at 11:45 (Middle/Earth)", local)).toBe(
      2 * HOUR + 30 * MINUTE,
    );
  });

  test("a nonsense clock is rejected rather than clamped into a plausible wait", () => {
    expect(parseLimitResetMs("resets 99:99pm (Europe/Tallinn)", NOON_UTC)).toBeUndefined();
  });

  test("a reset inside the current minute waits a minute, not the 30-minute fallback", () => {
    // 15:00 in Tallinn is exactly NOON_UTC, so the delta is zero minutes. The reset
    // is seconds away — falling back to 30m, or reading it as tomorrow, both lie.
    expect(parseLimitResetMs("resets 3:00pm (Europe/Tallinn)", NOON_UTC)).toBe(MINUTE);
  });
});

describe("detectEngineLimit", () => {
  test("turns the session-limit line into an absolute instant derived from now", () => {
    const limit = detectEngineLimit("claude-code", SESSION_LIMIT, NOON_UTC);
    expect(limit?.resetAt).toBe("2026-08-03T13:30:00.000Z");
  });

  test("running out of prepaid credit is not a limit — waiting would never clear it", () => {
    const raw = "Your credit balance is too low to access the Anthropic API";
    expect(detectEngineLimit("claude-code", raw, NOON_UTC)).toBeUndefined();
  });

  test("a matching line with no reset time still parks, without a reset instant", () => {
    const limit = detectEngineLimit("codex", "rate limit reached", NOON_UTC);
    expect(limit).toEqual({ raw: "rate limit reached" });
  });

  test("an ordinary crash is not mistaken for a limit", () => {
    expect(detectEngineLimit("cursor", "Cursor exited with code 1", NOON_UTC)).toBeUndefined();
  });
});

describe("limitWaitMs", () => {
  test("waits the remaining time when the reset is still ahead", () => {
    const limit = { raw: SESSION_LIMIT, resetAt: "2026-08-03T13:30:00.000Z" };
    expect(limitWaitMs(limit, NOON_UTC)).toBe(90 * MINUTE);
  });

  test("falls back to a fixed interval when no reset time was parsed", () => {
    expect(limitWaitMs({ raw: SESSION_LIMIT }, NOON_UTC)).toBe(DEFAULT_LIMIT_WAIT_MS);
  });

  test("a reset already in the past retries on the fallback rather than immediately", () => {
    const limit = { raw: SESSION_LIMIT, resetAt: "2026-08-03T11:00:00.000Z" };
    expect(limitWaitMs(limit, NOON_UTC)).toBe(DEFAULT_LIMIT_WAIT_MS);
  });

  test("a reset absurdly far out is clamped to a day", () => {
    const limit = { raw: SESSION_LIMIT, resetAt: "2027-08-03T12:00:00.000Z" };
    expect(limitWaitMs(limit, NOON_UTC)).toBe(24 * HOUR);
  });
});

describe("formatLimitWait", () => {
  test("names hours and minutes so a log line never implies a timezone", () => {
    expect(formatLimitWait(3 * HOUR + 38 * MINUTE)).toBe("3h 38m");
  });

  test("drops the hour component under an hour", () => {
    expect(formatLimitWait(30 * MINUTE)).toBe("30m");
  });

  test("a short wait reads in seconds — rounding it up to 1m is a lie", () => {
    expect(formatLimitWait(20_000)).toBe("20s");
  });
});

describe("selectionAfterLimit", () => {
  test("switching the model keeps the engine", () => {
    const next = selectionAfterLimit(
      { engine: "claude-code", model: "opus" },
      { choice: "switch-model", model: "haiku" },
    );
    expect(next).toEqual({ engine: "claude-code", model: "haiku" });
  });

  test("switching the harness drops a model id the new harness would not understand", () => {
    const next = selectionAfterLimit(
      { engine: "claude-code", model: "opus" },
      { choice: "switch-engine", engine: "codex" },
    );
    expect(next).toEqual({ engine: "codex", model: undefined });
  });

  test("retrying now changes nothing", () => {
    const current = { engine: "claude-code" as const, model: "opus" };
    expect(selectionAfterLimit(current, { choice: "retry-now" })).toEqual(current);
  });
});

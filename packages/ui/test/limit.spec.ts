// Unit spec: the countdown and the reset label are the only things telling an
// unattended user when the run comes back, and a wrong one reads as "stuck".
import { describe, expect, test } from "vitest";
import { formatCountdown, formatResetAt, remainingMs } from "../src/limit";
import { LIMIT_COPY } from "../src/limit-copy";
import { limit } from "./support/run-fixtures";

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

describe("formatCountdown", () => {
  test("drops the hour component under an hour so the number stays readable", () => {
    expect(formatCountdown(9 * MINUTE + 5 * SECOND)).toBe("09m 05s");
  });

  test("shows hours once the wait is long enough to leave the desk", () => {
    expect(formatCountdown(3 * HOUR + 7 * MINUTE + 2 * SECOND)).toBe("3h 07m 02s");
  });

  test("a reset already passed reads as zero rather than counting backwards", () => {
    expect(formatCountdown(-5 * MINUTE)).toBe("00m 00s");
  });
});

describe("formatResetAt", () => {
  test("an absent reset time has no label rather than a fabricated one", () => {
    expect(formatResetAt(undefined)).toBeUndefined();
  });

  test("a malformed instant is treated as absent rather than rendering Invalid Date", () => {
    expect(formatResetAt("not-a-date")).toBeUndefined();
  });
});

describe("remainingMs", () => {
  test("counts down to the stored instant", () => {
    const now = Date.parse("2026-07-21T12:00:00.000Z");
    expect(remainingMs(limit(), now)).toBe(90 * MINUTE);
  });

  test("never goes negative once the reset has passed", () => {
    const now = Date.parse("2026-07-21T14:00:00.000Z");
    expect(remainingMs(limit(), now)).toBe(0);
  });

  test("a limit with no parsed reset has no countdown at all", () => {
    const now = Date.parse("2026-07-21T12:00:00.000Z");
    expect(remainingMs(limit({ resetAt: undefined }), now)).toBeUndefined();
  });
});

describe("LIMIT_COPY.headline", () => {
  test("names the harness that hit the wall", () => {
    expect(LIMIT_COPY.headline(limit())).toBe("Claude Code hit its plan limit");
  });

  test("a repeat limit says so, so a mis-detection is visible rather than silent", () => {
    expect(LIMIT_COPY.headline(limit({ attempt: 3 }))).toBe(
      "Claude Code hit its plan limit again (3 times on this step)",
    );
  });
});

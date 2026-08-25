// Unit spec: an unattended schedule applies these rules thousands of times with
// nobody watching, so the two that only bite twice a year — a wall clock that
// jumps, and a zone that disagrees with the runner's — are covered first.
import { assert, expect, test } from "vitest";
import { isDueAt, nextRunAfter, recurrenceIssues } from "../src/recurrence.ts";

const NINE_AM = "0 9 * * *";
const BEFORE_THE_CLOCKS_CHANGE = "2026-03-27T12:00:00.000Z";

const berlin = { cron: NINE_AM, timezone: "Europe/Berlin" };

test("a daily wall-clock time survives a spring-forward, so that day is 23 hours long", () => {
  // Europe/Berlin loses 02:00–03:00 on 2026-03-29. 09:00 local still means
  // 09:00 local, which an implementation that adds 24h to the last fire misses.
  const first = nextRunAfter(berlin, BEFORE_THE_CLOCKS_CHANGE);
  assert(first, "a daily recurrence always has a next run");
  expect(first).toBe("2026-03-28T08:00:00.000Z");
  expect(nextRunAfter(berlin, first)).toBe("2026-03-29T07:00:00.000Z");
});

test("the same expression in a different zone fires at a different instant", () => {
  expect(nextRunAfter({ cron: NINE_AM, timezone: "Asia/Tokyo" }, "2026-03-28T12:00:00.000Z")).toBe(
    "2026-03-29T00:00:00.000Z",
  );
  expect(nextRunAfter(berlin, "2026-03-28T12:00:00.000Z")).toBe("2026-03-29T07:00:00.000Z");
});

test("the runner's own zone never leaks into the answer", () => {
  // A UTC recurrence fires at 09:00Z whatever TZ the machine running this is in.
  expect(nextRunAfter({ cron: NINE_AM, timezone: "UTC" }, BEFORE_THE_CLOCKS_CHANGE)).toBe(
    "2026-03-28T09:00:00.000Z",
  );
});

test("a window already past is due, and one still ahead is not", () => {
  const utc = { cron: NINE_AM, timezone: "UTC" };
  expect(isDueAt(utc, BEFORE_THE_CLOCKS_CHANGE, "2026-03-28T09:00:00.000Z")).toBe(true);
  expect(isDueAt(utc, BEFORE_THE_CLOCKS_CHANGE, "2026-03-28T08:59:59.000Z")).toBe(false);
});

test("a zone ICU does not know is blamed on the zone field, not on the expression beside it", () => {
  // Two fields, one dialog: the wrong path highlights the wrong input.
  expect(recurrenceIssues({ cron: NINE_AM, timezone: "Mars/Olympus" })[0]?.path).toEqual([
    "timezone",
  ]);
});

test("an unparseable expression is blamed on the expression", () => {
  expect(recurrenceIssues({ cron: "every tuesday-ish", timezone: "UTC" })[0]?.path).toEqual([
    "cron",
  ]);
});

test("a valid expression and zone raise no issue", () => {
  expect(recurrenceIssues({ cron: "*/15 * * * *", timezone: "America/New_York" })).toEqual([]);
});

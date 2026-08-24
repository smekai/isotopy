// An unattended schedule applies these rules thousands of times with nobody
// watching, so the two that only bite twice a year — a wall clock that jumps,
// and a zone that disagrees with the runner's — are covered first.
import { assert, expect, test } from "vitest";
import type { OrchestratorTeamProposal, Schedule } from "@isotopy/core";
import {
  nextFireForSchedule,
  nextScheduleFire,
  scheduleCronIssues,
} from "../../src/domain/rules/schedule-cron.ts";

const CREATED_AT = "2026-03-27T12:00:00.000Z";

const BOARD_READER: OrchestratorTeamProposal = {
  name: "Board reader",
  summary: "One persona, one step: read the board and name what is next.",
  roles: [
    { id: "reader", label: "Project Manager", skill: "project-manager", stepTask: "plan-feature" },
  ],
};

function schedule(overrides: Partial<Schedule> = {}): Schedule {
  return {
    id: "s1",
    projectId: "p1",
    name: "Nightly",
    cron: "0 9 * * *",
    timezone: "UTC",
    task: "Take the next task off the board",
    team: BOARD_READER,
    enabled: true,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    ...overrides,
  };
}

const berlin = schedule({ timezone: "Europe/Berlin" });

test("a daily wall-clock time survives a spring-forward, so that day is 23 hours long", () => {
  // Europe/Berlin loses 02:00–03:00 on 2026-03-29. 09:00 local still means
  // 09:00 local, which an implementation that adds 24h to the last fire misses.
  const first = nextScheduleFire(berlin, CREATED_AT);
  assert(first, "a daily schedule always has a next fire");
  expect(first).toBe("2026-03-28T08:00:00.000Z");
  expect(nextScheduleFire(berlin, first)).toBe("2026-03-29T07:00:00.000Z");
});

test("the same expression in a different zone fires at a different instant", () => {
  const tokyo = schedule({ timezone: "Asia/Tokyo" });
  expect(nextScheduleFire(tokyo, "2026-03-28T12:00:00.000Z")).toBe("2026-03-29T00:00:00.000Z");
  expect(nextScheduleFire(berlin, "2026-03-28T12:00:00.000Z")).toBe("2026-03-29T07:00:00.000Z");
});

test("the runner's own zone never leaks into the answer", () => {
  // A UTC schedule fires at 09:00Z whatever TZ the machine running this is in.
  expect(nextScheduleFire(schedule(), CREATED_AT)).toBe("2026-03-28T09:00:00.000Z");
});

test("a schedule fires from the window it last consumed, not from when it was created", () => {
  const consumed = schedule({ lastWindowAt: "2026-04-10T09:00:00.000Z" });
  expect(nextFireForSchedule(consumed)).toBe("2026-04-11T09:00:00.000Z");
});

test("an expression that cannot be parsed is refused rather than left to fail at fire time", () => {
  expect(scheduleCronIssues("every tuesday-ish", "UTC")).not.toEqual([]);
});

test("a zone ICU does not know is blamed on the zone field, not on the expression beside it", () => {
  // Two fields, one dialog: the wrong path highlights the wrong input.
  expect(scheduleCronIssues("0 9 * * *", "Mars/Olympus")[0]?.path).toEqual(["timezone"]);
});

test("an unparseable expression is blamed on the expression", () => {
  expect(scheduleCronIssues("every tuesday-ish", "UTC")[0]?.path).toEqual(["cron"]);
});

test("a valid expression and zone raise no issue", () => {
  expect(scheduleCronIssues("*/15 * * * *", "America/New_York")).toEqual([]);
});

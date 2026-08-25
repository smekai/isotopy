// Unit spec: cron arithmetic belongs to @isotopy/scheduler and is covered there.
// What stays here is the one rule that is about a *schedule* rather than a
// recurrence — which instant its next fire is measured from.
import { expect, test } from "vitest";
import type { Schedule } from "@isotopy/core";
import { nextFireForSchedule, scheduleIsDue } from "../../src/domain/rules/schedule-timing.ts";

const CREATED_AT = "2026-03-27T12:00:00.000Z";

function schedule(overrides: Partial<Schedule> = {}): Schedule {
  return {
    id: "s1",
    projectId: "p1",
    name: "Nightly",
    cron: "0 9 * * *",
    timezone: "UTC",
    task: "Take the next task off the board",
    enabled: true,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    ...overrides,
  };
}

test("a schedule fires from the window it last consumed, not from when it was created", () => {
  const consumed = schedule({ lastWindowAt: "2026-04-10T09:00:00.000Z" });
  expect(nextFireForSchedule(consumed)).toBe("2026-04-11T09:00:00.000Z");
});

test("a schedule that has consumed nothing measures from its creation", () => {
  expect(nextFireForSchedule(schedule())).toBe("2026-03-28T09:00:00.000Z");
});

test("a disabled schedule is never due, however long its window has been past", () => {
  expect(scheduleIsDue(schedule({ enabled: false }), "2027-01-01T00:00:00.000Z")).toBe(false);
});

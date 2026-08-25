// Unit spec: a scheduled task either pins the team that runs it or hands its
// prompt to the Orchestrator, and the server forks on exactly this. A schema
// that silently accepted a missing team without the predicate agreeing would
// send prompt-only work down the fixed-team path.
import { describe, expect, test } from "vitest";
import type { Schedule } from "../src/schedules.ts";
import { createScheduleSchema, scheduleSchema, schedulePinsTeam } from "../src/schedules.ts";

const CREATED_AT = "2026-08-25T09:00:00.000Z";

const TEAM = {
  name: "Board reader",
  summary: "One persona, one step.",
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
    enabled: true,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    ...overrides,
  };
}

describe("schedulePinsTeam", () => {
  test("a schedule carrying a team pins it", () => {
    expect(schedulePinsTeam(schedule({ team: TEAM }))).toBe(true);
  });

  test("a schedule with no team is a prompt for the Orchestrator", () => {
    expect(schedulePinsTeam(schedule())).toBe(false);
  });
});

describe("the stored and submitted shapes", () => {
  test("a stored schedule without a team round-trips", () => {
    expect(scheduleSchema.safeParse(schedule()).success).toBe(true);
  });

  test("a submitted schedule may omit the team entirely", () => {
    const parsed = createScheduleSchema.safeParse({
      name: "Nightly",
      cron: "0 9 * * *",
      timezone: "UTC",
      task: "Take the next task off the board",
    });
    expect(parsed.success).toBe(true);
  });

  test("a team that is present is still shaped, so optional does not mean unchecked", () => {
    const parsed = createScheduleSchema.safeParse({
      name: "Nightly",
      cron: "0 9 * * *",
      timezone: "UTC",
      task: "Take the next task off the board",
      team: { name: "Broken", summary: "No roles at all", roles: [] },
    });
    expect(parsed.success).toBe(false);
  });
});

// Component test: the schedules a project is given rather than writes — the board
// poller every project has, and the duties its agents bring — and the reason they
// are safe to ship: each is seeded switched off, a fresh install and an upgraded
// project behave exactly as before, and nothing fires until the owner opts in. An
// unattended loop that turns itself on is the failure this file exists to prevent.
import { afterEach, assert, beforeEach, describe, expect, inject, test } from "vitest";
import { HOME_PROJECT_ID } from "@isotopy/core";
import type { ScheduleView, SettingsView, TeamDefinition } from "@isotopy/core";
import path from "node:path";
import { mkdtemp } from "node:fs/promises";
import { vi } from "vitest";
import type { ProjectPath } from "../../src/paths.ts";
import { writeProjectAgent, writeProjectDuty, writeProjectStep } from "../support/agent-files.ts";
import { writeTeam } from "../support/orchestration-fixtures.ts";
import {
  createTestApp,
  del,
  get,
  post,
  put,
  restartApp,
  waitForRunStatus,
} from "../support/harness.ts";
import type { TestApp } from "../support/harness.ts";

let ctx: TestApp;

beforeEach(async () => {
  ctx = await createTestApp();
});

afterEach(async () => {
  vi.restoreAllMocks();
  await ctx.dispose();
});

test("every project has the built-in schedules from the start, and every one is off", async () => {
  // Act
  const { body: schedules } = await get<ScheduleView[]>(ctx.app, "/schedules");

  // Assert
  expect(schedules.map((schedule) => schedule.builtIn)).toEqual(["board-poller"]);
  expect(schedules.every((schedule) => !schedule.enabled)).toBe(true);
});

test("a fresh project polls nothing, because the gate is off by default", async () => {
  // Arrange — the record is enabled, but the project-level gate is not.
  const poller = await builtInPoller();
  await enable(poller.id);

  // Anticipate — none: a fresh install must behave exactly as it did before.

  // Act
  const outcome = await ctx.schedules.fire(poller.id);

  // Assert
  expect(outcome).toBeUndefined();
  ctx.engine.verify();
});

test("a project upgraded from settings written before the gate existed stays off", async () => {
  // Arrange — preferences saved by an older build carry no builtInSchedules key.
  await put<SettingsView>(ctx.app, "/settings/preferences", { engine: "codex" });
  const poller = await builtInPoller();
  await enable(poller.id);

  // Anticipate — none: an upgrade must not opt anyone in.

  // Act
  const outcome = await ctx.schedules.fire(poller.id);

  // Assert
  expect(preferencesOf(await get<SettingsView>(ctx.app, "/settings"))).toBe(false);
  expect(outcome).toBeUndefined();
  ctx.engine.verify();
});

test("with the gate on and the record enabled, the poller opens one Orchestrator conversation", async () => {
  // Arrange — both switches, deliberately.
  const poller = await builtInPoller();
  await put<SettingsView>(ctx.app, "/settings/preferences", { builtInSchedules: true });
  await enable(poller.id);

  // Anticipate — the poller hands its prompt over; it does not run a team itself.
  ctx.engine.anticipate({ as: "Orchestrator", persona: /# Role: Orchestrator/ }).parks("Reading.");

  // Act
  const outcome = await ctx.schedules.fire(poller.id);

  // Assert
  expect(outcome?.kind).toBe("fired");
  await ctx.engine.waitForCall();
  ctx.engine.verify();
});

// The boundary is respected by the agent, not enforced by the scheduler, so the
// prompt is where it lives — and the two skip axes have to stay distinguishable
// there or the run log cannot say which rule applied.
// Walking every configured state and excluding only In Progress would let an empty
// Next hand the team a finished task off Done or Rejected.
test("the poller is told that finished work is never next", async () => {
  // Arrange
  const poller = await builtInPoller();

  // Assert
  expect(poller.task).toContain("Never take a task from **Done** or");
  expect(poller.task).toContain("**Rejected**");
});

test("the poller is still told not to re-take work already in progress", async () => {
  // Arrange
  const poller = await builtInPoller();

  // Assert
  expect(poller.task).toContain("Never take");
  expect(poller.task).toContain("**In Progress**");
});

test("the poller is told an assigned task belongs to the person named", async () => {
  // Arrange
  const poller = await builtInPoller();

  // Assert
  expect(poller.task).toContain("Skip a task with an assignee");
});

test("the poller is told a waiting date is a different reason from an assignee", async () => {
  // Arrange
  const poller = await builtInPoller();

  // Assert
  expect(poller.task).toContain("waiting-until date");
  expect(poller.task).toContain("different reason");
});

test("the poller may mark work for the owner but never unmark it", async () => {
  // Arrange
  const poller = await builtInPoller();

  // Assert
  expect(poller.task).toContain("Never change or clear an assignee");
});

test("a deleted built-in returns on the next load, because every project has one", async () => {
  // Arrange
  const poller = await builtInPoller();
  await del<unknown>(ctx.app, `/schedules/${poller.id}`);
  await ctx.orchestrator.shutdown();

  // Act
  const restarted = await restartApp();

  // Assert
  const reseeded = restarted.schedules.listSchedules("home");
  expect(reseeded.map((schedule) => schedule.builtIn)).toContain("board-poller");
  await restarted.shutdown();
});

test("a project added while the server is running gets its built-ins straight away", async () => {
  // Arrange — POST /projects previously only touched the registry, so a project
  // created at runtime had no poller until the next restart.
  const root = await mkdtemp(path.join(inject("testTempRoot"), "added-"));

  // Act
  const created = await post<{ project: { id: string } }>(ctx.app, "/projects", { root });

  // Assert
  expect(created.status).toBe(201);
  const listed = ctx.schedules.listSchedules(created.body.project.id);
  expect(listed.map((schedule) => schedule.builtIn)).toContain("board-poller");
});

test("a schedule blocked by the project gate says so and offers no fire time", async () => {
  // Arrange — the record is on while the project-level gate is not.
  const poller = await builtInPoller();
  await enable(poller.id);

  // Act
  const { body: schedules } = await get<ScheduleView[]>(ctx.app, "/schedules");

  // Assert — the view has to match what the scheduler will actually do.
  const blocked = schedules.find((schedule) => schedule.builtIn === "board-poller");
  expect(blocked?.blockedBy).toBe("built_ins_disabled");
  expect(blocked?.nextFireAt).toBeUndefined();
});

describe("duties an agent brings", () => {
  beforeEach(async () => {
    await writeProjectAgent(ctx.home);
    await writeProjectStep(ctx.home);
    await writeTeam(ctx.home, METRICS_TEAM);
  });

  test("a duty an agent brings is seeded switched off, with its cron, timezone and the flow it names", async () => {
    // Arrange
    await writeProjectDuty(ctx.home, { flow: "metrics" });
    await ctx.orchestrator.shutdown();

    // Act
    const restarted = await restartApp();

    // Assert
    expect(dutyIn(restarted.schedules.listSchedules(HOME_PROJECT_ID))).toMatchObject({
      name: "Weekly metrics",
      cron: "0 8 * * 1",
      timezone: "UTC",
      flow: "metrics",
      enabled: false,
    });
    await restarted.shutdown();
  });

  test("a duty is seeded once, and editing its file afterwards leaves the schedule as it was", async () => {
    // Arrange
    await writeProjectDuty(ctx.home);
    await ctx.schedules.seedDuties(home());
    await writeProjectDuty(ctx.home, { cron: "0 9 * * 1" });

    // Act
    await ctx.schedules.seedDuties(home());

    // Assert
    const seeded = ctx.schedules
      .listSchedules(HOME_PROJECT_ID)
      .filter((schedule) => schedule.builtIn === DUTY_KEY);
    expect(seeded.map((schedule) => schedule.cron)).toEqual(["0 8 * * 1"]);
  });

  test("a duty whose cron cannot be parsed is not seeded, and the operator log says why", async () => {
    // Arrange
    await writeProjectDuty(ctx.home, { cron: "every monday" });

    // Act
    await ctx.schedules.seedDuties(home());

    // Assert
    expect(dutyIn(ctx.schedules.listSchedules(HOME_PROJECT_ID))).toBeUndefined();
    expect(ctx.logger.at("warn").map((entry) => entry.message)).toContainEqual(
      expect.stringContaining(DUTY_KEY),
    );
  });

  test("a duty an agent brings waits on the same project switch as the board poller", async () => {
    // Arrange
    await writeProjectDuty(ctx.home);
    await ctx.schedules.seedDuties(home());
    await enable(seededDuty().id);

    // Act
    const { body: schedules } = await get<ScheduleView[]>(ctx.app, "/schedules");

    // Assert
    expect(dutyIn(schedules)?.blockedBy).toBe("built_ins_disabled");
  });

  test("an enabled duty, with the switch on, runs the flow it names", async () => {
    // Arrange
    await writeProjectDuty(ctx.home, { flow: "metrics" });
    await ctx.schedules.seedDuties(home());
    await put<SettingsView>(ctx.app, "/settings/preferences", { builtInSchedules: true });
    await enable(seededDuty().id);

    // Anticipate
    ctx.engine
      .anticipate({ as: "Growth Marketer", persona: /^# Role: Growth Marketer/ })
      .reports("Read the numbers.\n\nVERDICT: PASS");
    ctx.engine.anticipateRunReview();

    // Act
    const outcome = await ctx.schedules.fire(seededDuty().id);

    // Assert
    assert(outcome?.kind === "fired", "the duty fired");
    await waitForRunStatus(ctx.app, outcome.runId, "completed");
    ctx.engine.verify();
  });
});

const DUTY_KEY = "growth-marketer/weekly-metrics";

const METRICS_TEAM: TeamDefinition = {
  roster: [{ id: "metrics", label: "Reading the numbers", agent: "growth-marketer" }],
  flows: { metrics: [{ role: "metrics", step: "plan-campaign" }] },
};

function home(): ProjectPath {
  return ctx.registry.resolve(HOME_PROJECT_ID);
}

function dutyIn(schedules: ScheduleView[]): ScheduleView | undefined {
  return schedules.find((schedule) => schedule.builtIn === DUTY_KEY);
}

function seededDuty(): ScheduleView {
  const duty = dutyIn(ctx.schedules.listSchedules(HOME_PROJECT_ID));
  assert(duty, "the duty was seeded");
  return duty;
}

function preferencesOf(response: { body: SettingsView }): boolean {
  return response.body.preferences.builtInSchedules;
}

async function builtInPoller(): Promise<ScheduleView> {
  const { body: schedules } = await get<ScheduleView[]>(ctx.app, "/schedules");
  const poller = schedules.find((schedule) => schedule.builtIn === "board-poller");
  assert(poller, "every project is seeded with the board poller");
  return poller;
}

// Fired by hand in these tests, so its own cron waits for midnight on a leap day.
async function enable(scheduleId: string, cron = "0 0 29 2 *"): Promise<void> {
  const patched = await ctx.schedules.updateSchedule(scheduleId, { enabled: true, cron });
  expect(patched.enabled, "the built-in record is on").toBe(true);
}

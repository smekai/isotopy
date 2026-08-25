// Component test: the one schedule every project has from the start, and the
// reason it is safe to ship it — a fresh install and an upgraded project both
// behave exactly as they did before it existed. An unattended loop that turns
// itself on is the failure this file exists to prevent.
import { afterEach, assert, beforeEach, expect, test } from "vitest";
import type { ScheduleView, SettingsView } from "@isotopy/core";
import { BUILT_IN_SCHEDULES } from "../../src/domain/rules/built-in-schedules.ts";
import { createTestApp, del, get, put, restartApp } from "../support/harness.ts";
import type { TestApp } from "../support/harness.ts";

const AN_HOUR_ON = new Date(Date.now() + 60 * 60 * 1000).toISOString();

let ctx: TestApp;

beforeEach(async () => {
  ctx = await createTestApp();
});

afterEach(async () => {
  await ctx.dispose();
});

test("every project has the built-in schedules from the start, and every one is off", async () => {
  // Act
  const { body: schedules } = await get<ScheduleView[]>(ctx.app, "/schedules");

  // Assert
  expect(schedules.map((schedule) => schedule.builtIn)).toEqual(
    BUILT_IN_SCHEDULES.map((definition) => definition.key),
  );
  expect(schedules.every((schedule) => !schedule.enabled)).toBe(true);
});

test("a fresh project polls nothing, because the gate is off by default", async () => {
  // Arrange — the record is enabled, but the project-level gate is not.
  const poller = await builtInPoller();
  await enable(poller.id);

  // Anticipate — none: a fresh install must behave exactly as it did before.

  // Act
  const ticks = await ctx.schedules.tick(AN_HOUR_ON);

  // Assert
  expect(ticks).toEqual([]);
  ctx.engine.verify();
});

test("a project upgraded from settings written before the gate existed stays off", async () => {
  // Arrange — preferences saved by an older build carry no builtInSchedules key.
  await put<SettingsView>(ctx.app, "/settings/preferences", { engine: "codex" });
  const poller = await builtInPoller();
  await enable(poller.id);

  // Anticipate — none: an upgrade must not opt anyone in.

  // Act
  const ticks = await ctx.schedules.tick(AN_HOUR_ON);

  // Assert
  expect(preferencesOf(await get<SettingsView>(ctx.app, "/settings"))).toBe(false);
  expect(ticks).toEqual([]);
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
  const ticks = await ctx.schedules.tick(AN_HOUR_ON);

  // Assert
  expect(ticks).toHaveLength(1);
  await ctx.engine.waitForCall();
  ctx.engine.verify();
});

test("the poller's prompt says which board states it may draw from", async () => {
  // Arrange — the read order is the only place this rule lives, so it is the
  // only thing that can be checked.
  const poller = await builtInPoller();

  // Assert
  expect(poller.task).toContain("Next");
  expect(poller.task).toContain("Backlog");
  expect(poller.task).toContain("In Progress");
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

function preferencesOf(response: { body: SettingsView }): boolean {
  return response.body.preferences.builtInSchedules;
}

async function builtInPoller(): Promise<ScheduleView> {
  const { body: schedules } = await get<ScheduleView[]>(ctx.app, "/schedules");
  const poller = schedules.find((schedule) => schedule.builtIn === "board-poller");
  assert(poller, "every project is seeded with the board poller");
  return poller;
}

async function enable(scheduleId: string, cron = "* * * * *"): Promise<void> {
  const patched = await ctx.schedules.updateSchedule(scheduleId, { enabled: true, cron });
  expect(patched.enabled, "the built-in record is on").toBe(true);
}

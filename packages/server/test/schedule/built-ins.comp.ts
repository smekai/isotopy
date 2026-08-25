// Component test: the one schedule every project has from the start, and the
// reason it is safe to ship it — a fresh install and an upgraded project both
// behave exactly as they did before it existed. An unattended loop that turns
// itself on is the failure this file exists to prevent.
import { afterEach, assert, beforeEach, expect, test } from "vitest";
import type { ScheduleView, SettingsView } from "@isotopy/core";
import { BUILT_IN_SCHEDULES } from "../../src/domain/rules/built-in-schedules.ts";
import os from "node:os";
import path from "node:path";
import { mkdtemp } from "node:fs/promises";
import { vi } from "vitest";
import { createTestApp, del, get, post, put, restartApp } from "../support/harness.ts";
import { JsonRecordRepository } from "../../src/repository/json-record-repository.ts";
import type { TestApp } from "../support/harness.ts";

const AN_HOUR_ON = new Date(Date.now() + 60 * 60 * 1000).toISOString();

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

test("a project added while the server is running gets its built-ins straight away", async () => {
  // Arrange — POST /projects previously only touched the registry, so a project
  // created at runtime had no poller until the next restart.
  const root = await mkdtemp(path.join(os.tmpdir(), "isotopy-added-"));

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

test("a window that could not be claimed is recorded, so the dashboard does not show stale state", async () => {
  // Arrange — the claiming write fails; the ticker discards what tick() returns,
  // so the record is the only place an operator can see this.
  const created = await createUserSchedule();
  failTheNextWrite("disk is full");

  // Act
  const ticks = await ctx.schedules.tick(AN_HOUR_ON);

  // Assert
  expect(ticks[0]?.outcome).toEqual({ kind: "failed", error: "disk is full" });
  expect(ctx.schedules.getSchedule(created.id)?.lastOutcome).toEqual({
    kind: "failed",
    error: "disk is full",
  });
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

async function createUserSchedule(): Promise<ScheduleView> {
  const { body } = await post<ScheduleView>(ctx.app, "/schedules", {
    name: "User schedule",
    cron: "* * * * *",
    timezone: "UTC",
    task: "Do the thing",
  });
  return body;
}

function failTheNextWrite(message: string): void {
  vi.spyOn(JsonRecordRepository.prototype, "write").mockRejectedValueOnce(new Error(message));
}

async function enable(scheduleId: string, cron = "* * * * *"): Promise<void> {
  const patched = await ctx.schedules.updateSchedule(scheduleId, { enabled: true, cron });
  expect(patched.enabled, "the built-in record is on").toBe(true);
}

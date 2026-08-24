import { afterEach, assert, beforeEach, expect, test, vi } from "vitest";
import type { Orchestration, OrchestratorTeamProposal, ScheduleView } from "@isotopy/core";
import type { ScheduleTick } from "../../src/services/schedule-service.ts";
import {
  addTestProject,
  createTestApp,
  del,
  get,
  patch,
  post,
  restartApp,
  waitForRunStatus,
} from "../support/harness.ts";
import type { TestApp } from "../support/harness.ts";

const EVERY_MINUTE = "* * * * *";

// Fixed at module load so a tick and the assertion about it name the same
// instant; every schedule under test is created later, and so is due at both.
const AN_HOUR_ON = new Date(Date.now() + 60 * 60 * 1000).toISOString();
const THREE_DAYS_ON = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();

const BOARD_READER: OrchestratorTeamProposal = {
  name: "Board reader",
  summary: "One persona, one step: read the board and name what is next.",
  roles: [
    {
      id: "reader",
      label: "Project Manager",
      skill: "project-manager",
      stepTask: "plan-feature",
    },
  ],
};

let ctx: TestApp;

beforeEach(async () => {
  ctx = await createTestApp();
});

afterEach(async () => {
  vi.restoreAllMocks();
  await ctx.dispose();
});

test("an expression that cannot be parsed is refused when the schedule is saved, not when it fires", async () => {
  // Anticipate — none: a schedule that cannot fire never reaches an engine.

  // Act
  const response = await post<{ issues: { path: string[] }[] }>(
    ctx.app,
    "/schedules",
    scheduleBody({ cron: "every tuesday-ish" }),
  );

  // Assert
  expect(response.status).toBe(400);
  expect(response.body.issues[0]?.path).toEqual(["cron"]);
  ctx.engine.verify();
});

test("a team naming a persona that does not exist is refused when the schedule is saved", async () => {
  // Arrange
  const unknownPersona = { ...BOARD_READER.roles[0]!, skill: "wizard" };

  // Anticipate — none.

  // Act
  const response = await post<{ issues: { message: string }[] }>(
    ctx.app,
    "/schedules",
    scheduleBody({ team: { ...BOARD_READER, roles: [unknownPersona] } }),
  );

  // Assert
  expect(response.status).toBe(400);
  expect(response.body.issues[0]?.message).toContain("wizard");
  ctx.engine.verify();
});

test("an edit that would leave a schedule unable to fire is refused, and the stored one is untouched", async () => {
  // Arrange
  const created = await createSchedule();

  // Act
  const response = await patch<unknown>(ctx.app, `/schedules/${created.id}`, {
    timezone: "Mars/Olympus",
  });

  // Assert
  expect(response.status).toBe(400);
  const stored = await get<ScheduleView>(ctx.app, `/schedules/${created.id}`);
  expect(stored.body.timezone).toBe("UTC");
});

test("the server sends the next fire time, so the browser never parses a cron expression", async () => {
  // Act
  const created = await createSchedule({ cron: "0 9 * * *", timezone: "Europe/Berlin" });

  // Assert
  assert(created.nextFireAt, "an enabled daily schedule always has a next fire");
  expect(new Date(created.nextFireAt).getTime()).toBeGreaterThan(Date.now());
});

test("a due schedule starts exactly one run, and that run carries the team pinned to the schedule", async () => {
  // Arrange
  const created = await createSchedule({ cron: EVERY_MINUTE });

  // Anticipate — the pinned team is one Project Manager, not the project default.
  ctx.engine.anticipate({ as: "Project Manager" }).reports("Next: TASK-999.");
  ctx.engine.anticipateRunReview();

  // Act
  const ticks = await ctx.schedules.tick(AN_HOUR_ON);

  // Assert
  expect(ticks).toEqual([
    { scheduleId: created.id, outcome: { kind: "fired", runId: expect.any(String) } },
  ]);
  const run = await waitForRunStatus(ctx.app, firedRunId(ticks), "completed");
  expect(run.pipeline?.groups[0]?.stages.map((stage) => stage.skill)).toEqual([
    "project-manager",
  ]);
  const stored = await get<ScheduleView>(ctx.app, `/schedules/${created.id}`);
  expect(stored.body.lastFiredAt).toBe(AN_HOUR_ON);
  ctx.engine.verify();
});

test("the Orchestrator that owns a scheduled run knows which schedule started it", async () => {
  // Arrange
  const created = await createSchedule({ cron: EVERY_MINUTE });

  // Anticipate
  ctx.engine.anticipate({ as: "Project Manager" }).reports("Next: TASK-999.");
  ctx.engine.anticipateRunReview();

  // Act
  const ticks = await ctx.schedules.tick(AN_HOUR_ON);

  // Assert — this is what lets the rail show one group per schedule rather than
  // one per episode, however many times it has fired.
  await waitForRunStatus(ctx.app, firedRunId(ticks), "completed");
  const orchestrations = await get<Orchestration[]>(ctx.app, "/orchestrations");
  expect(orchestrations.body[0]?.scheduleId).toBe(created.id);
});

test("windows missed while the machine slept owe one run between them, not one each", async () => {
  // Arrange — a per-minute schedule, ticked as if the machine woke three days on.
  const created = await createSchedule({ cron: EVERY_MINUTE });

  // Anticipate — one fire, therefore one engine call.
  ctx.engine.anticipate({ as: "Project Manager" }).reports("Next: TASK-999.");
  ctx.engine.anticipateRunReview();

  // Act
  const ticks = await ctx.schedules.tick(THREE_DAYS_ON);

  // Assert
  expect(ticks).toHaveLength(1);
  await waitForRunStatus(ctx.app, firedRunId(ticks), "completed");
  const stored = await get<ScheduleView>(ctx.app, `/schedules/${created.id}`);
  expect(stored.body.lastWindowAt).toBe(THREE_DAYS_ON);
  ctx.engine.verify();
});

test("a window already consumed does not fire again, however long the machine was asleep", async () => {
  // Arrange — the three-day catch-up has already happened.
  await createSchedule({ cron: EVERY_MINUTE });
  ctx.engine.anticipate({ as: "Project Manager" }).reports("Next: TASK-999.");
  ctx.engine.anticipateRunReview();
  const first = await ctx.schedules.tick(THREE_DAYS_ON);
  await waitForRunStatus(ctx.app, firedRunId(first), "completed");

  // Act
  const second = await ctx.schedules.tick(THREE_DAYS_ON);

  // Assert — catching up consumed the window; it does not owe the ones it slept through.
  expect(second).toEqual([]);
  ctx.engine.verify();
});

test("a due schedule that finds a run already active records a skip instead of starting a second", async () => {
  // Arrange
  const created = await createSchedule({ cron: EVERY_MINUTE });

  // Anticipate — the manual run holds the project open; the schedule adds nothing.
  ctx.engine.anticipate({ as: "Developer" }).hangsUntilAborted();

  // Act
  const ticks = await tickWhileARunIsActive();

  // Assert
  expect(ticks).toEqual([
    { scheduleId: created.id, outcome: { kind: "skipped", reason: "run_active" } },
  ]);
  const stored = await get<ScheduleView>(ctx.app, `/schedules/${created.id}`);
  expect(stored.body.lastOutcome).toEqual({ kind: "skipped", reason: "run_active" });
  expect(stored.body.lastFiredAt).toBeUndefined();
});

test("a disabled schedule does not fire, and accumulates no debt while it is off", async () => {
  // Arrange
  const created = await createSchedule({ cron: EVERY_MINUTE, enabled: false });

  // Anticipate — none: a disabled schedule must not reach an engine.

  // Act
  const ticks = await ctx.schedules.tick(THREE_DAYS_ON);

  // Assert
  expect(ticks).toEqual([]);
  const stored = await get<ScheduleView>(ctx.app, `/schedules/${created.id}`);
  expect(stored.body.lastWindowAt).toBeUndefined();
  ctx.engine.verify();
});

test("a schedule and the window it last consumed survive a server restart", async () => {
  // Arrange
  const created = await createSchedule({ cron: EVERY_MINUTE });
  ctx.engine.anticipate({ as: "Project Manager" }).reports("Next: TASK-999.");
  ctx.engine.anticipateRunReview();
  const ticks = await ctx.schedules.tick(AN_HOUR_ON);
  await waitForRunStatus(ctx.app, firedRunId(ticks), "completed");
  await ctx.orchestrator.shutdown();

  // Act
  const restarted = await restartApp();

  // Assert — crash safety lives in the record, not in a parked workflow.
  expect(restarted.schedules.getSchedule(created.id)?.lastWindowAt).toBe(AN_HOUR_ON);
  await restarted.shutdown();
});

test("a deleted schedule is gone from the project rather than merely switched off", async () => {
  // Arrange
  const created = await createSchedule();

  // Act
  const response = await del<unknown>(ctx.app, `/schedules/${created.id}`);

  // Assert
  expect(response.status).toBe(200);
  expect((await get<ScheduleView[]>(ctx.app, "/schedules")).body).toEqual([]);
});

test("a schedule belongs to its project, and another project cannot read it", async () => {
  // Arrange — an id from one project, used while scoped to another.
  const created = await createSchedule();
  const other = await addTestProject(ctx.registry, "other");

  // Act
  const response = await get<unknown>(ctx.app, `/schedules/${created.id}`, other.headers);

  // Assert
  expect(response.status).toBe(404);
});

test("another project cannot edit a schedule it does not own", async () => {
  // Arrange
  const created = await createSchedule();
  const other = await addTestProject(ctx.registry, "other");

  // Act
  const response = await patch<unknown>(
    ctx.app,
    `/schedules/${created.id}`,
    { name: "Renamed from elsewhere" },
    other.headers,
  );

  // Assert
  expect(response.status).toBe(404);
  const stored = await get<ScheduleView>(ctx.app, `/schedules/${created.id}`);
  expect(stored.body.name).toBe("Board poller");
});

test("another project cannot delete a schedule it does not own", async () => {
  // Arrange
  const created = await createSchedule();
  const other = await addTestProject(ctx.registry, "other");

  // Act
  const response = await del<unknown>(ctx.app, `/schedules/${created.id}`, other.headers);

  // Assert
  expect(response.status).toBe(404);
  expect((await get<ScheduleView[]>(ctx.app, "/schedules")).body).toHaveLength(1);
});

test("turning a paused schedule back on owes nothing for the windows it slept through", async () => {
  // Arrange — paused, so it consumed no window while it was off.
  const created = await createSchedule({ cron: EVERY_MINUTE, enabled: false });

  // Act
  const resumed = await patch<ScheduleView>(ctx.app, `/schedules/${created.id}`, {
    enabled: true,
  });

  // Assert — the anchor moves to the moment it was enabled, so the pause is not
  // a backlog of paid runs waiting for the first tick.
  expect(resumed.body.lastWindowAt).toBeDefined();
  expect(resumed.body.lastWindowAt! >= created.createdAt).toBe(true);
});

test("a run that fails to start is recorded as failed rather than left reading as a fire", async () => {
  // Arrange
  const created = await createSchedule({ cron: EVERY_MINUTE });

  // Anticipate — the run never starts, so no engine is reached.
  vi.spyOn(ctx.orchestrator, "startComposedRun").mockRejectedValueOnce(
    new Error("claude-code is not installed"),
  );

  // Act
  const ticks = await ctx.schedules.tick(AN_HOUR_ON);

  // Assert — "Last ran" here would be a lie told to nobody who was watching.
  expect(ticks).toEqual([
    {
      scheduleId: created.id,
      outcome: { kind: "failed", error: "claude-code is not installed" },
    },
  ]);
  const stored = await get<ScheduleView>(ctx.app, `/schedules/${created.id}`);
  expect(stored.body.lastFiredAt).toBeUndefined();
  ctx.engine.verify();
});

test("one schedule failing to start does not stop the schedules after it from firing", async () => {
  // Arrange — two due on the same tick; the first one's start throws.
  await createSchedule({ name: "Broken", cron: EVERY_MINUTE });
  const healthy = await createSchedule({ name: "Healthy", cron: EVERY_MINUTE });
  vi.spyOn(ctx.orchestrator, "startComposedRun").mockRejectedValueOnce(
    new Error("claude-code is not installed"),
  );

  // Anticipate — the second schedule still reaches an engine.
  ctx.engine.anticipate({ as: "Project Manager" }).reports("Next: TASK-999.");
  ctx.engine.anticipateRunReview();

  // Act
  const ticks = await ctx.schedules.tick(AN_HOUR_ON);

  // Assert
  await waitForRunStatus(ctx.app, firedRunId(ticks), "completed");
  expect(outcomeKindFor(ticks, healthy.id)).toBe("fired");
  ctx.engine.verify();
});

function outcomeKindFor(ticks: ScheduleTick[], scheduleId: string): string | undefined {
  return ticks.find((tick) => tick.scheduleId === scheduleId)?.outcome.kind;
}

function scheduleBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: "Board poller",
    cron: "0 9 * * *",
    timezone: "UTC",
    task: "Take the next task off the board",
    team: BOARD_READER,
    ...overrides,
  };
}

async function createSchedule(
  overrides: Record<string, unknown> = {},
): Promise<ScheduleView> {
  const response = await post<ScheduleView>(ctx.app, "/schedules", scheduleBody(overrides));
  expect(response.status, "creating the schedule").toBe(200);
  return response.body;
}

async function tickWhileARunIsActive(): Promise<ScheduleTick[]> {
  await post(ctx.app, "/runs", {
    pipelineId: "solo",
    task: "Manual work already under way",
    engine: "claude-code",
  });
  return ctx.schedules.tick(AN_HOUR_ON);
}

function firedRunId(ticks: ScheduleTick[]): string {
  const fired = ticks.find((tick) => tick.outcome.kind === "fired");
  assert(fired?.outcome.kind === "fired", "the tick started no run");
  return fired.outcome.runId;
}

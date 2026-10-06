import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { afterEach, assert, beforeEach, expect, test, vi } from "vitest";
import type {
  Orchestration,
  OrchestratorTeamProposal,
  RunState,
  ScheduleOutcome,
  ScheduleView,
} from "@isotopy/core";
import {
  addTestProject,
  createTestApp,
  del,
  get,
  patch,
  post,
  getRun,
  restartApp,
  waitForRunStatus,
} from "../support/harness.ts";
import type { TestApp } from "../support/harness.ts";
import { HOME_PROJECT_ID } from "@isotopy/core";
import { JsonRecordsTable, SCHEDULES_TABLE } from "../../src/db/json-records-table.ts";
import { ProjectDatabases } from "../../src/db/project-databases.ts";
import { JsonRecordRepository } from "../../src/repository/json-record-repository.ts";
import { RecordingLogger } from "../support/recording-logger.ts";

// A schedule that a test fires by hand must not also fire on its own while the
// test runs, so it waits for midnight on a leap day.
const LEAP_DAY = "0 0 29 2 *";

// The one schedule that is meant to fire on its own does so within a second.
const EVERY_SECOND = "* * * * * *";

// Which pipeline a scheduled run lands on is how the two paths are told apart.
const ORCHESTRATION_PIPELINE = "orchestration";

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
  const created = await createSchedule({
    cron: "0 9 * * *",
    timezone: "Europe/Berlin",
    enabled: false,
  });

  // Assert
  assert(created.nextFireAt, "a daily schedule always has a next fire");
  expect(new Date(created.nextFireAt).getTime()).toBeGreaterThan(Date.now());
});

test("a fired schedule starts exactly one run, and that run carries the team pinned to the schedule", async () => {
  // Arrange
  const created = await createSchedule();

  // Anticipate — the pinned team is one Project Manager, not the project default.
  ctx.engine.anticipate({ as: "Project Manager" }).reports("Next: TASK-999.");
  ctx.engine.anticipateRunReview();

  // Act
  const outcome = await ctx.schedules.fire(created.id);

  // Assert
  expect(outcome).toEqual({ kind: "fired", runId: expect.any(String) });
  const run = await waitForRunStatus(ctx.app, firedRunId(outcome), "completed");
  expect(run.pipeline?.groups[0]?.stages.map((stage) => stage.skill)).toEqual([
    "project-manager",
  ]);
  const stored = await get<ScheduleView>(ctx.app, `/schedules/${created.id}`);
  expect(stored.body.lastFiredAt).toBeDefined();
  ctx.engine.verify();
});

test("an enabled schedule is fired by its own cron, with nobody calling it", async () => {
  // Arrange
  const fire = vi.spyOn(ctx.schedules, "fire").mockResolvedValue(undefined);

  // Act
  const created = await createSchedule({ cron: EVERY_SECOND });

  // Assert
  await vi.waitFor(() => expect(fire).toHaveBeenCalledWith(created.id), { timeout: 5_000 });
});

test("a schedule keeps firing on its own after a server restart", async () => {
  // Arrange
  vi.spyOn(ctx.schedules, "fire").mockResolvedValue(undefined);
  const created = await createSchedule({ cron: EVERY_SECOND });
  await ctx.orchestrator.shutdown();

  // Act
  const restarted = await restartApp();

  // Assert
  const fire = vi.spyOn(restarted.schedules, "fire").mockResolvedValue(undefined);
  await vi.waitFor(() => expect(fire).toHaveBeenCalledWith(created.id), { timeout: 5_000 });
  await restarted.shutdown();
});

test("switching a schedule off stops its cron, rather than leaving it to fire into nothing", async () => {
  // Arrange
  const fire = vi.spyOn(ctx.schedules, "fire").mockResolvedValue(undefined);
  const created = await createSchedule({ cron: EVERY_SECOND });
  await vi.waitFor(() => expect(fire).toHaveBeenCalled(), { timeout: 5_000 });

  // Act
  await patch<ScheduleView>(ctx.app, `/schedules/${created.id}`, { enabled: false });

  // Assert — a fire already on its way when the switch landed may still arrive.
  await sleep(500);
  fire.mockClear();
  await sleep(1_500);
  expect(fire).not.toHaveBeenCalled();
});

test("the Orchestrator that owns a scheduled run knows which schedule started it", async () => {
  // Arrange
  const created = await createSchedule();

  // Anticipate
  ctx.engine.anticipate({ as: "Project Manager" }).reports("Next: TASK-999.");
  ctx.engine.anticipateRunReview();

  // Act
  const outcome = await ctx.schedules.fire(created.id);

  // Assert — this is what lets the rail show one group per schedule rather than
  // one per episode, however many times it has fired.
  await waitForRunStatus(ctx.app, firedRunId(outcome), "completed");
  const orchestrations = await get<Orchestration[]>(ctx.app, "/orchestrations");
  expect(orchestrations.body[0]?.scheduleId).toBe(created.id);
});

test("a fired schedule that finds a run already active records a skip instead of starting a second", async () => {
  // Arrange
  const created = await createSchedule();

  // Anticipate — the manual run holds the project open; the schedule adds nothing.
  ctx.engine.anticipate({ as: "Developer" }).hangsUntilAborted();

  // Act
  const outcome = await fireWhileARunIsActive(created.id);

  // Assert
  expect(outcome).toEqual({ kind: "skipped", reason: "run_active" });
  const stored = await get<ScheduleView>(ctx.app, `/schedules/${created.id}`);
  expect(stored.body.lastOutcome).toEqual({ kind: "skipped", reason: "run_active" });
  expect(stored.body.lastFiredAt).toBeUndefined();
});

test("a disabled schedule does not fire, even when asked to", async () => {
  // Arrange
  const created = await createSchedule({ enabled: false });

  // Anticipate — none: a disabled schedule must not reach an engine.

  // Act
  const outcome = await ctx.schedules.fire(created.id);

  // Assert
  expect(outcome).toBeUndefined();
  ctx.engine.verify();
});

test("a schedule stored while Isotopy kept its own window still loads after the upgrade", async () => {
  // Arrange — records written by the ticker carry the window it last consumed.
  await seedHomeScheduleRow("ticked01", {
    id: "ticked01",
    projectId: HOME_PROJECT_ID,
    name: "Nightly sweep",
    cron: LEAP_DAY,
    timezone: "UTC",
    task: "Sweep the board",
    enabled: false,
    lastWindowAt: "2026-10-01T09:00:00.000Z",
    createdAt: "2026-09-01T09:00:00.000Z",
    updatedAt: "2026-09-01T09:00:00.000Z",
  });

  // Act
  const restarted = await restartApp();

  // Assert
  expect((await get<ScheduleView>(restarted.app, "/schedules/ticked01")).status).toBe(200);
  await restarted.shutdown();
});

test("a deleted schedule is gone from the project rather than merely switched off", async () => {
  // Arrange
  const created = await createSchedule();

  // Act
  const response = await del<unknown>(ctx.app, `/schedules/${created.id}`);

  // Assert
  expect(response.status).toBe(200);
  expect(await userSchedules()).toEqual([]);
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
  expect(await userSchedules()).toHaveLength(1);
});

test("a run that fails to start is recorded as failed rather than left reading as a fire", async () => {
  // Arrange
  const created = await createSchedule();

  // Anticipate — the run never starts, so no engine is reached.
  vi.spyOn(ctx.orchestrator, "startComposedRun").mockRejectedValueOnce(
    new Error("claude-code is not installed"),
  );

  // Act
  const outcome = await ctx.schedules.fire(created.id);

  // Assert — "Last ran" here would be a lie told to nobody who was watching.
  expect(outcome).toEqual({ kind: "failed", error: "claude-code is not installed" });
  const stored = await get<ScheduleView>(ctx.app, `/schedules/${created.id}`);
  expect(stored.body.lastFiredAt).toBeUndefined();
  ctx.engine.verify();
});

test("a schedule whose project was removed does not run somewhere else instead", async () => {
  // Arrange — a schedule in its own project, which is then unregistered.
  const other = await addTestProject(ctx.registry, "removed");
  const orphan = await createSchedule({}, other.headers);
  ctx.registry.unregister(other.id);

  // Anticipate — none: an orphaned schedule must not spend money in Home.

  // Act
  const outcome = await ctx.schedules.fire(orphan.id);

  // Assert
  expect(outcome).toBeUndefined();
  ctx.engine.verify();
});

test("removing a project takes its schedules with it, so a restart cannot adopt them", async () => {
  // Arrange
  const other = await addTestProject(ctx.registry, "removed");
  const orphan = await createSchedule({}, other.headers);

  // Act
  await del<unknown>(ctx.app, `/projects/${other.id}`);

  // Assert — left in memory, `loadProject` would later rewrite its projectId.
  expect(ctx.schedules.getSchedule(orphan.id)).toBeUndefined();
});

test("an outcome that cannot be recorded is reported to whoever runs the server", async () => {
  // Arrange — a run already under way makes this fire a skip, so recording its
  // outcome is the only write it makes.
  const created = await createSchedule();
  ctx.engine.anticipate({ as: "Developer" }).hangsUntilAborted();
  await post(ctx.app, "/runs", {
    pipelineId: "solo",
    task: "Manual work already under way",
    engine: "claude-code",
  });
  failTheNextWrite("disk is full");

  // Act
  await ctx.schedules.fire(created.id);

  // Assert
  expect(ctx.logger.at("error")).toEqual([
    expect.objectContaining({ message: expect.stringContaining(created.id) }),
  ]);
});

test("a schedule with no team hands its prompt to the Orchestrator rather than a fixed team", async () => {
  // Arrange — a scheduled task that says what it wants, not who does it.
  const created = await createSchedule({ team: undefined });

  // Anticipate — the Orchestrator opens the conversation; no composed team runs.
  ctx.engine.anticipate({ as: "Orchestrator", persona: /# Role: Orchestrator/ }).parks("Thinking.");

  // Act
  const outcome = await ctx.schedules.fire(created.id);

  // Assert
  await ctx.engine.waitForCall();
  const run = await getRun(ctx.app, firedRunId(outcome));
  expect(run.pipelineId).toBe(ORCHESTRATION_PIPELINE);
  ctx.engine.verify();
});

test("the Orchestrator's opening turn carries the board, so the prompt need not repeat it", async () => {
  // Arrange — a project that actually has a board to carry.
  const boarded = await addTestProject(ctx.registry, "boarded");
  await seedBoard(boarded.root, "## TASK-421: Rename the widget\n**Priority:** P1\n\n---\n");
  const created = await createSchedule({ team: undefined }, boarded.headers);

  // Anticipate — the board reaches the prompt the Orchestrator is handed.
  ctx.engine.anticipate({ as: "Orchestrator", prompt: /TASK-421/ }).parks("Thinking.");

  // Act
  await ctx.schedules.fire(created.id);

  // Assert
  await ctx.engine.waitForCall();
  ctx.engine.verify();
});

test("a schedule that pins a team still runs that team, not a conversation", async () => {
  // Arrange — the regression: pinning a team must not have become a prompt.
  const created = await createSchedule();

  // Anticipate
  ctx.engine.anticipate({ as: "Project Manager" }).reports("Next: TASK-999.");
  ctx.engine.anticipateRunReview();

  // Act
  const outcome = await ctx.schedules.fire(created.id);

  // Assert
  const run = await waitForRunStatus(ctx.app, firedRunId(outcome), "completed");
  expect(run.pipeline?.groups[0]?.stages.map((stage) => stage.skill)).toEqual([
    "project-manager",
  ]);
  ctx.engine.verify();
});

test("a prompt-only schedule waits rather than superseding a conversation someone is mid-way through", async () => {
  // Arrange — orchestrations.start() terminates an active Orchestrator, and a
  // parked conversation is not a run, so admitRun cannot see it.
  const created = await createSchedule({ team: undefined });
  ctx.engine.anticipate({ as: "Orchestrator" }).reports("Still weighing it up.");
  const { body: conversation } = await post<RunState>(ctx.app, "/orchestrations", {
    goal: "Ship the settings screen",
    engine: "claude-code",
  });
  // The run settles while the conversation stays open, so admitRun sees nothing.
  await waitForRunStatus(ctx.app, conversation.id, "needs_attention");

  // Act
  const outcome = await ctx.schedules.fire(created.id);

  // Assert
  expect(outcome).toEqual({ kind: "skipped", reason: "orchestrator_busy" });
  ctx.engine.verify();
});

async function seedBoard(root: string, tasks: string): Promise<void> {
  const dir = path.join(root, ".tasks");
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, "config.json"),
    JSON.stringify({
      version: 2,
      idPrefix: "TASK",
      nextId: 422,
      states: [{ name: "Backlog", fileName: "BACKLOG.md" }],
      insertPosition: "top",
    }),
  );
  await writeFile(path.join(dir, "BACKLOG.md"), `# Backlog

${tasks}`);
}

// Every project is seeded with the built-in schedules, so a test about the ones
// someone created has to say so.
async function userSchedules(): Promise<ScheduleView[]> {
  const { body } = await get<ScheduleView[]>(ctx.app, "/schedules");
  return body.filter((schedule) => schedule.builtIn === undefined);
}

function scheduleBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: "Board poller",
    cron: LEAP_DAY,
    timezone: "UTC",
    task: "Take the next task off the board",
    team: BOARD_READER,
    ...overrides,
  };
}

async function createSchedule(
  overrides: Record<string, unknown> = {},
  headers: Record<string, string> = {},
): Promise<ScheduleView> {
  const response = await post<ScheduleView>(
    ctx.app,
    "/schedules",
    scheduleBody(overrides),
    headers,
  );
  expect(response.status, "creating the schedule").toBe(200);
  return response.body;
}

async function seedHomeScheduleRow(id: string, record: unknown): Promise<void> {
  const databases = new ProjectDatabases(new RecordingLogger());
  const projectPath = { id: HOME_PROJECT_ID, root: ctx.home, dataDir: ctx.home };
  await new JsonRecordsTable(databases.for(projectPath), SCHEDULES_TABLE).upsert(
    id,
    JSON.stringify(record),
  );
  await databases.settleAll();
}

function failTheNextWrite(message: string): void {
  vi.spyOn(JsonRecordRepository.prototype, "write").mockRejectedValueOnce(new Error(message));
}

async function fireWhileARunIsActive(scheduleId: string): Promise<ScheduleOutcome | undefined> {
  await post(ctx.app, "/runs", {
    pipelineId: "solo",
    task: "Manual work already under way",
    engine: "claude-code",
  });
  return ctx.schedules.fire(scheduleId);
}

function firedRunId(outcome: ScheduleOutcome | undefined): string {
  assert(outcome?.kind === "fired", "the fire started no run");
  return outcome.runId;
}

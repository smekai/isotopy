// The rail's transport: a project-scoped SSE channel. `GET /runs` is a snapshot,
// so without this stream a run list only ever changes on reload. Two properties
// carry the weight — the channel pushes every status transition, and it is
// scoped to one project (a run in project B must never surface in project A).
// The same channel carries each orchestration as it is stored, because an
// initiative's state can change after the last event of any run it owns.
import { afterEach, beforeEach, expect, test } from "vitest";
import {
  addTestProject,
  createTestApp,
  openSse,
  orchestrationsOf,
  startOrchestration,
  startRun,
  summariesOf,
  waitForRunStatus,
} from "../support/harness.ts";
import type { TestApp } from "../support/harness.ts";
import { TEAM_PROPOSAL, fenced } from "../support/orchestration-fixtures.ts";

const TASK = "add a greet function";
const DEV_REPORT = "Implemented it. MARKER-DEVELOPER";

let ctx: TestApp;

beforeEach(async () => {
  ctx = await createTestApp();
});

afterEach(async () => {
  await ctx.dispose();
});

test("the project stream pushes a summary as a run advances", async () => {
  // Arrange
  const { app, engine } = ctx;
  engine.anticipate({ as: "Agent" }).reports(DEV_REPORT);
  const stream = await openSse(app, "/runs/events");

  // Act
  const run = await startRun(app, { pipelineId: "solo", task: TASK, engine: "claude-code" });
  await waitForRunStatus(app, run.id, "completed");
  const events = await stream.waitFor(
    (seen) => summariesOf(seen).some((summary) => summary.status === "completed"),
    "a completed summary on the project stream",
  );
  await stream.close();

  // Assert
  const summaries = summariesOf(events);
  expect(summaries.map((summary) => summary.id)).toEqual(summaries.map(() => run.id));
  expect(summaries.map((summary) => summary.status)).toContain("running");
  expect(summaries.at(-1)?.status).toBe("completed");
  expect(summaries.at(-1)?.task).toBe(TASK);
});

test("a summary carries stage progress but never the logs", async () => {
  // Arrange — logs are the bulk of a RunState and would be re-sent on every
  // transition; the rail only needs each stage's status.
  const { app, engine } = ctx;
  engine.anticipate({ as: "Agent" }).reports(DEV_REPORT);
  const stream = await openSse(app, "/runs/events");

  // Act
  const run = await startRun(app, { pipelineId: "solo", task: TASK, engine: "claude-code" });
  await waitForRunStatus(app, run.id, "completed");
  const events = await stream.waitFor(
    (seen) => summariesOf(seen).some((summary) => summary.status === "completed"),
    "a completed summary on the project stream",
  );
  await stream.close();

  // Assert
  const last = summariesOf(events).at(-1);
  expect(last?.stages.map((stage) => stage.id)).toEqual(["solo"]);
  expect(last?.stages.map((stage) => stage.status)).toEqual(["passed"]);
  expect(Object.keys(last?.stages[0] ?? {})).toEqual(["id", "label", "status"]);
});

test("the stream carries only its own project's runs", async () => {
  // Arrange
  const { app, engine, registry } = ctx;
  const other = await addTestProject(registry, "stream-other");
  engine.anticipate({ as: "Agent" }).reports(DEV_REPORT);
  const homeStream = await openSse(app, "/runs/events");

  // Act — the run belongs to the other project, not the stream's.
  const run = await startRun(
    app,
    { pipelineId: "solo", task: "other project run", engine: "claude-code" },
    other.headers,
  );
  await waitForRunStatus(app, run.id, "completed");
  const events = await homeStream.waitFor(() => true, "the stream to settle");
  await homeStream.close();

  // Assert
  expect(summariesOf(events)).toEqual([]);
});

test("the project is selectable by query, because EventSource cannot set headers", async () => {
  // Arrange
  const { app, engine, registry } = ctx;
  const other = await addTestProject(registry, "stream-query");
  engine.anticipate({ as: "Agent" }).reports(DEV_REPORT);
  const stream = await openSse(app, `/runs/events?project=${other.id}`);

  // Act
  const run = await startRun(
    app,
    { pipelineId: "solo", task: "query scoped run", engine: "claude-code" },
    other.headers,
  );
  await waitForRunStatus(app, run.id, "completed");
  const events = await stream.waitFor(
    (seen) => summariesOf(seen).some((summary) => summary.status === "completed"),
    "a completed summary on the query-scoped stream",
  );
  await stream.close();

  // Assert
  expect(summariesOf(events).at(-1)?.task).toBe("query scoped run");
});

test("the project stream carries an initiative's decision as it is recorded, so the app need not ask again", async () => {
  // Arrange
  const { app, engine } = ctx;
  const stream = await openSse(app, "/runs/events");

  // Anticipate
  engine
    .anticipate({ as: "Orchestrator", persona: /# Role: Orchestrator/ })
    .reports(fenced(TEAM_PROPOSAL));

  // Act
  const conversation = await startOrchestration(app);

  // Assert
  const events = await stream.waitFor(
    (seen) => orchestrationsOf(seen).some((orchestration) => orchestration.status === "awaiting_approval"),
    "the proposal on the project stream",
  );
  await stream.close();
  expect(orchestrationsOf(events).at(-1)).toMatchObject({
    id: conversation.orchestrationId,
    status: "awaiting_approval",
    latestDecision: { action: "propose_team" },
  });
  engine.verify();
});

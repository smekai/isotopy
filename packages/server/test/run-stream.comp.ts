// The rail's transport: a project-scoped SSE channel. `GET /runs` is a snapshot,
// so without this stream a run list only ever changes on reload. Two properties
// carry the weight — the channel pushes every status transition, and it is
// scoped to one project (a run in project B must never surface in project A).
import { afterEach, beforeEach, expect, test } from "vitest";
import {
  addTestProject,
  createTestApp,
  openSse,
  startRun,
  summariesOf,
  waitForRunStatus,
} from "./support/harness.ts";
import type { TestApp } from "./support/harness.ts";

const TASK = "add a greet function";
const DEV_REPORT = "Implemented it. MARKER-DEVELOPER";
const TESTER_REPORT = "Verified it.\n\nVERDICT: PASS";

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
  engine.anticipate({ as: "Developer" }).reports(DEV_REPORT);
  engine.anticipate({ as: "Tester" }).reports(TESTER_REPORT);
  const stream = await openSse(app, "/runs/events");

  // Act
  const run = await startRun(app, { pipelineId: "dev-test", task: TASK, engine: "claude-code" });
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
  engine.anticipate({ as: "Developer" }).reports(DEV_REPORT);
  engine.anticipate({ as: "Tester" }).reports(TESTER_REPORT);
  const stream = await openSse(app, "/runs/events");

  // Act
  const run = await startRun(app, { pipelineId: "dev-test", task: TASK, engine: "claude-code" });
  await waitForRunStatus(app, run.id, "completed");
  const events = await stream.waitFor(
    (seen) => summariesOf(seen).some((summary) => summary.status === "completed"),
    "a completed summary on the project stream",
  );
  await stream.close();

  // Assert
  const last = summariesOf(events).at(-1);
  expect(last?.stages.map((stage) => stage.id)).toEqual(["implementation", "test"]);
  expect(last?.stages.map((stage) => stage.status)).toEqual(["passed", "passed"]);
  expect(Object.keys(last?.stages[0] ?? {})).toEqual(["id", "label", "status"]);
});

test("the stream carries only its own project's runs", async () => {
  // Arrange
  const { app, engine, registry } = ctx;
  const other = await addTestProject(registry, "stream-other");
  engine.anticipate({ as: "Developer" }).reports(DEV_REPORT);
  engine.anticipate({ as: "Tester" }).reports(TESTER_REPORT);
  const homeStream = await openSse(app, "/runs/events");

  // Act — the run belongs to the other project, not the stream's.
  const run = await startRun(
    app,
    { pipelineId: "dev-test", task: "other project run", engine: "claude-code" },
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
  engine.anticipate({ as: "Developer" }).reports(DEV_REPORT);
  engine.anticipate({ as: "Tester" }).reports(TESTER_REPORT);
  const stream = await openSse(app, `/runs/events?project=${other.id}`);

  // Act
  const run = await startRun(
    app,
    { pipelineId: "dev-test", task: "query scoped run", engine: "claude-code" },
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

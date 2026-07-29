// The user's half of the conversation. Agent narration already exists as stage
// logs; a user turn is the one thing the server has to store, emit and replay.
// TASK-078 records and broadcasts it — nothing consumes it until TASK-079 gives
// an asking stage something to resume from.
import { afterEach, beforeEach, expect, test } from "vitest";
import type { RunEvent, RunMessage, RunState } from "@adhd/core";
import {
  createTestApp,
  get,
  openSse,
  post,
  restartApp,
  startRun,
  waitForRunStatus,
} from "./support/harness.ts";
import type { TestApp } from "./support/harness.ts";

const TASK = "add a greet function";
const DEV_REPORT = "Implemented it. MARKER-DEVELOPER";

let ctx: TestApp;

beforeEach(async () => {
  ctx = await createTestApp();
});

afterEach(async () => {
  await ctx.dispose();
});

test("a message is recorded on the run and survives a re-read", async () => {
  // Arrange
  const { app, engine } = ctx;
  engine.anticipate({ as: "Developer" }).hangsUntilAborted();
  const run = await startRun(app, { pipelineId: "solo", task: TASK, engine: "claude-code" });
  await engine.waitForCall(1);

  // Act
  const { status, body } = await post<RunMessage>(app, `/runs/${run.id}/messages`, {
    text: "prefer the dark palette",
  });

  // Assert
  expect(status).toBe(201);
  expect(body.role).toBe("user");
  expect(body.text).toBe("prefer the dark palette");
  const { body: reread } = await get<RunState>(app, `/runs/${run.id}`);
  expect(reread.messages.map((message) => message.text)).toEqual(["prefer the dark palette"]);
});

test("a message reaches the run's event stream so an open tab sees it", async () => {
  // Arrange
  const { app, engine } = ctx;
  engine.anticipate({ as: "Developer" }).hangsUntilAborted();
  const run = await startRun(app, { pipelineId: "solo", task: TASK, engine: "claude-code" });
  await engine.waitForCall(1);
  const stream = await openSse(app, `/runs/${run.id}/events`);

  // Act
  await post(app, `/runs/${run.id}/messages`, { text: "keep it small" });
  const events = await stream.waitFor(
    (seen) => seen.some((event) => event.event === "run.message"),
    "a run.message event",
  );
  await stream.close();

  // Assert — the reducer dedupes by message id, so replay overlap is not a bug
  // here; what matters is that the event carries the message at all.
  const posted = events.filter((event) => event.event === "run.message");
  const first = JSON.parse(posted[0]?.data ?? "{}") as RunEvent;
  expect(first.type).toBe("run.message");
  expect(first.chatMessage?.text).toBe("keep it small");
  expect(first.chatMessage?.role).toBe("user");
});

test("an empty message is rejected before anything is recorded", async () => {
  // Arrange
  const { app, engine } = ctx;
  engine.anticipate({ as: "Developer" }).hangsUntilAborted();
  const run = await startRun(app, { pipelineId: "solo", task: TASK, engine: "claude-code" });
  await engine.waitForCall(1);

  // Act
  const { status, body } = await post<{
    error: string;
    issues: { path: (string | number)[] }[];
  }>(app, `/runs/${run.id}/messages`, { text: "   " });

  // Assert
  expect(status).toBe(400);
  expect(body.error).toBe("Invalid request");
  expect(body.issues[0]?.path).toEqual(["text"]);
  const { body: reread } = await get<RunState>(app, `/runs/${run.id}`);
  expect(reread.messages).toEqual([]);
});

test("a finished run refuses the message rather than storing one nobody will read", async () => {
  // Arrange
  const { app, engine } = ctx;
  engine.anticipate({ as: "Developer" }).reports(DEV_REPORT);
  const run = await startRun(app, { pipelineId: "solo", task: TASK, engine: "claude-code" });
  await waitForRunStatus(app, run.id, "completed");

  // Act
  const { status, body } = await post<{ error: string }>(app, `/runs/${run.id}/messages`, {
    text: "one more thing",
  });

  // Assert
  expect(status).toBe(409);
  expect(body.error).toMatch(/has finished/);
});

test("an unknown run is a 404", async () => {
  // Arrange
  const { app } = ctx;

  // Act
  const { status, body } = await post<{ error: string }>(app, "/runs/nope/messages", {
    text: "hello",
  });

  // Assert
  expect(status).toBe(404);
  expect(body.error).toBe("Run not found");
});

test("messages survive a server restart", async () => {
  // Arrange — the run is held open so the message lands well before the run
  // reaches a terminal status, which would refuse it.
  const { app, engine } = ctx;
  engine.anticipate({ as: "Developer" }).hangsUntilAborted();
  const run = await startRun(app, { pipelineId: "solo", task: TASK, engine: "claude-code" });
  await engine.waitForCall(1);
  await post(app, `/runs/${run.id}/messages`, { text: "written mid-run" });
  await post(app, `/runs/${run.id}/abort`);
  await waitForRunStatus(app, run.id, "cancelled");
  await ctx.orchestrator.shutdown();

  // Act
  const restarted = await restartApp();
  const { body } = await get<RunState>(restarted.app, `/runs/${run.id}`);

  // Assert
  expect(body.messages.map((message) => message.text)).toEqual(["written mid-run"]);
  await restarted.orchestrator.shutdown();
});

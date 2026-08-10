// A finished run has to name what it built. The rules that derive a change set
// are unit-tested in run-changes.spec.ts and the collector in
// run-change-collector.comp.ts; what only a whole run can show is the wiring —
// that the baseline is taken before the first box writes anything, that the
// change set is attached before the run reports itself finished, and that it
// survives to the API a client actually reads.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import type { RunState } from "@adhd/core";
import { createTestApp, get, startRun, waitForRunStatus } from "../support/harness.ts";
import type { TestApp } from "../support/harness.ts";

const TASK = "add a greet function";

const PIPELINE = { pipelineId: "solo", task: TASK, engine: "claude-code" };

const GREET = "export const greet = () => 'hi';\n";

let ctx: TestApp;

beforeEach(async () => {
  ctx = await createTestApp();
});

afterEach(async () => {
  await ctx.dispose();
});

test("a finished run names the file its box created", async () => {
  // Arrange
  const { app, engine } = ctx;

  // Anticipate
  engine.anticipate({ as: "Developer" }).writes({ "greet.js": GREET }, "Done.");
  engine.anticipateRunReview();

  // Act
  const run = await startRun(app, PIPELINE);

  // Assert
  const finished = await waitForRunStatus(app, run.id, "completed");
  expect(finished.changes?.files).toEqual([{ path: "greet.js", kind: "created" }]);
});

test("the change set is on the run the client fetches, not only in memory", async () => {
  // Arrange
  const { app, engine } = ctx;

  // Anticipate
  engine.anticipate({ as: "Developer" }).writes({ "greet.js": GREET }, "Done.");
  engine.anticipateRunReview();

  // Act
  const run = await startRun(app, PIPELINE);
  await waitForRunStatus(app, run.id, "completed");

  // Assert
  const { body } = await get<RunState>(app, `/runs/${run.id}`);
  expect(body.changes?.source).toBe("snapshot");
});

test("what changed is written beside the run, so it outlives the process", async () => {
  // Arrange
  const { app, engine, home } = ctx;

  // Anticipate
  engine.anticipate({ as: "Developer" }).writes({ "greet.js": GREET }, "Done.");
  engine.anticipateRunReview();

  // Act
  const run = await startRun(app, PIPELINE);
  await waitForRunStatus(app, run.id, "completed");

  // Assert
  const written = await readFile(
    path.join(home, "runs", run.id, "changes", "changes.md"),
    "utf8",
  );
  expect(written).toContain("`greet.js`");
});

test("a run whose box wrote nothing reports an empty change set rather than none", async () => {
  // Arrange
  const { app, engine } = ctx;

  // Anticipate
  engine.anticipate({ as: "Developer" }).reports("Nothing to do.");
  engine.anticipateRunReview();

  // Act
  const run = await startRun(app, PIPELINE);

  // Assert
  const finished = await waitForRunStatus(app, run.id, "completed");
  expect(finished.changes?.files).toEqual([]);
});

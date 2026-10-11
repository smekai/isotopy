// A persona or step file opens with its catalog entry in YAML front matter. That
// entry is for the catalog; the engine must only ever see the prose under it.
import path from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import {
  approveIntake,
  createTestApp,
  stageOf,
  startRun,
  waitForRunStatus,
} from "../support/harness.ts";
import type { TestApp } from "../support/harness.ts";
import { writeText } from "../support/agent-files.ts";

test("a stage's persona and assignment reach the engine without their front matter", async () => {
  // Arrange
  const { app, engine } = ctx;

  // Anticipate — the persona opens at its role heading, and the assignment follows
  // its section heading directly, with no YAML between.
  engine
    .anticipate({
      as: "Product Manager",
      persona: /^# Role: Product Manager/,
      prompt: /^## Step task\n\n# Assignment: Plan a feature/,
    })
    .reports(PM_REPORT);
  engine.anticipate({ as: "Developer" }).reports(DEV_REPORT);
  engine.anticipate({ as: "QA Engineer" }).reports(TESTER_REPORT);
  engine.anticipateRunReview();

  // Act
  const run = await startRun(app, PIPELINE);
  await approveIntake(app, run.id);

  // Assert
  await waitForRunStatus(app, run.id, "completed");
  engine.verify();
});

test("a reference file without front matter is still listed, and the stage's log says why", async () => {
  // Arrange
  const { app, engine, home } = ctx;
  await writeText(path.join(home, "agents", "solo", "knowledge", "raw-notes.md"), "Just notes.");

  // Anticipate — the file is listed for the agent even though it has no description.
  engine.anticipate({ as: "Agent", persona: /raw-notes\.md`/ }).reports("Done.");
  engine.anticipateRunReview();

  // Act
  const run = await startRun(app, { pipelineId: "solo", task: "tidy up", engine: "claude-code" });

  // Assert
  const finished = await waitForRunStatus(app, run.id, "completed");
  expect(stageOf(finished, "solo").logs.map((entry) => entry.message)).toContainEqual(
    expect.stringMatching(/raw-notes\.md is listed without a description/),
  );
  engine.verify();
});

const PM_REPORT = "Add a greet function. Done when it prints a greeting.";
const DEV_REPORT = "Added greet.js and a smoke check.";
const TESTER_REPORT = "Ran the suite, all green.\n\nVERDICT: PASS";

const PIPELINE = {
  pipelineId: "pm-dev-test",
  task: "add a greet function",
  engine: "claude-code",
};

let ctx: TestApp;

beforeEach(async () => {
  ctx = await createTestApp();
});

afterEach(async () => {
  await ctx.dispose();
});

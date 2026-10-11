// A persona or step file opens with its catalog entry in YAML front matter. That
// entry is for the catalog; the engine must only ever see the prose under it.
import { afterEach, beforeEach, test } from "vitest";
import {
  approveIntake,
  createTestApp,
  startRun,
  waitForRunStatus,
} from "../support/harness.ts";
import type { TestApp } from "../support/harness.ts";

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

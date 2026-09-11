// A step's context used to be a branch on its id — `stepTask !== "verify-feature"`
// in the workflow. What only a run can show is that the declaration in the file is
// now what decides, so a project can move that context onto a step Isotopy never
// shipped, and take it off the one that has it.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import type { ProjectAutomationConfig, UiAutomation } from "@isotopy/core";
import {
  approveIntake,
  createTestApp,
  put,
  startRun,
  waitForRunStatus,
} from "../support/harness.ts";
import type { TestApp } from "../support/harness.ts";

const PRODUCT_ENVIRONMENT = "Isotopy owns this project's product process";

const HEALTH_URL = "http://127.0.0.1:59998/";

const PM_REPORT = "Add a greet function. Done when it prints a greeting.";
const DEV_REPORT = "Added greet.js and a smoke check.";
const TESTER_REPORT = "Ran the suite, all green.\n\nVERDICT: PASS";

const PIPELINE = {
  pipelineId: "pm-dev-test",
  task: "add a greet function",
  engine: "claude-code",
};

const QA_CALL = 2;
const DEVELOPER_CALL = 1;

let ctx: TestApp;

beforeEach(async () => {
  ctx = await createTestApp();
});

afterEach(async () => {
  await ctx.dispose();
});

test("a step declaring the product environment is told how to ask Isotopy for it", async () => {
  // Arrange
  const { app, engine } = ctx;
  await put<ProjectAutomationConfig>(app, "/automation", automationConfig());

  // Anticipate
  anticipateDelivery();

  // Act
  const run = await startRun(app, PIPELINE);
  await approveIntake(app, run.id);

  // Assert
  await waitForRunStatus(app, run.id, "completed");
  expect(engine.callAt(QA_CALL).prompt).toContain(PRODUCT_ENVIRONMENT);
});

test("a step that declares no context is not handed the product, whatever its neighbours declare", async () => {
  // Arrange
  const { app, engine } = ctx;
  await put<ProjectAutomationConfig>(app, "/automation", automationConfig());

  // Anticipate
  anticipateDelivery();

  // Act
  const run = await startRun(app, PIPELINE);
  await approveIntake(app, run.id);

  // Assert
  await waitForRunStatus(app, run.id, "completed");
  expect(engine.callAt(DEVELOPER_CALL).prompt).not.toContain(PRODUCT_ENVIRONMENT);
});

test("a project that takes the context off a step task takes the product with it", async () => {
  // Arrange — the same step task, overridden to declare no context.
  const { app, engine, home } = ctx;
  await put<ProjectAutomationConfig>(app, "/automation", automationConfig());
  await writeProjectStepTask(home, "verify-feature", "# Assignment: Verify\n\nCheck it works.");

  // Anticipate
  anticipateDelivery();

  // Act
  const run = await startRun(app, PIPELINE);
  await approveIntake(app, run.id);

  // Assert
  await waitForRunStatus(app, run.id, "completed");
  expect(engine.callAt(QA_CALL).prompt).not.toContain(PRODUCT_ENVIRONMENT);
});

// A malformed assignment is the project's typo, not a reason to lose a paid run.
test("a step task a project broke warns and runs without its assignment", async () => {
  // Arrange
  const { app, engine, home } = ctx;
  await writeProjectStepTask(home, "implement-feature", "---\nagents: developer\n---\n\nBuild it.");

  // Anticipate
  anticipateDelivery();

  // Act
  const run = await startRun(app, PIPELINE);
  await approveIntake(app, run.id);

  // Assert
  const finished = await waitForRunStatus(app, run.id, "completed");
  expect(engine.callAt(DEVELOPER_CALL).prompt).not.toContain("Build it.");
  expect(warningsOn(finished, "implementation")).toContain("is malformed");
});

function anticipateDelivery(): void {
  const { engine } = ctx;
  engine.anticipate({ as: "Product Manager" }).reports(PM_REPORT);
  engine.anticipate({ as: "Developer" }).reports(DEV_REPORT);
  engine.anticipate({ as: "QA Engineer" }).reports(TESTER_REPORT);
  engine.anticipateRunReview();
}

async function writeProjectStepTask(
  home: string,
  id: string,
  content: string,
): Promise<void> {
  const dir = path.join(home, "step-tasks");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `${id}.md`), content, "utf8");
}

function warningsOn(run: { stages: { id: string; logs: { level: string; message: string }[] }[] }, stageId: string): string {
  return (run.stages.find((stage) => stage.id === stageId)?.logs ?? [])
    .filter((log) => log.level === "warn")
    .map((log) => log.message)
    .join("; ");
}

function automationConfig(): ProjectAutomationConfig {
  return { version: 1, validation: [], ui: uiAutomation() };
}

function uiAutomation(): UiAutomation {
  return {
    start: {
      executable: process.execPath,
      args: ["-e", "setTimeout(() => {}, 10000)"],
      timeoutMs: 10_000,
    },
    healthUrl: HEALTH_URL,
    readyTimeoutMs: 200,
  };
}

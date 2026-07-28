// The shipped three-box flow: Product Manager → gate → Developer → QA Engineer.
//
// This is the suite that made the live tier cheap: it proves the boxes genuinely
// chain — each one is handed what the previous reported and works in the same
// directory — without spawning a CLI or spending a cent. The live Playwright test
// now only has to prove the real CLI still integrates.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import type { RunState } from "@adhd/core";
import {
  approveIntake,
  createTestApp,
  get,
  post,
  put,
  stageOf,
  startRun,
  waitForRunStatus,
} from "./support/harness.ts";
import type { TestApp } from "./support/harness.ts";

/** Distinct markers so an assertion can tell the boxes' output apart. */
const PM_REPORT = "Add a greet function. Done when it prints a greeting. MARKER-PM";
const DEV_REPORT = "Added greet.js and a smoke check. MARKER-DEVELOPER";
const TESTER_REPORT = "Ran the suite, all green. MARKER-TESTER\n\nVERDICT: PASS";

const TASK = "add a greet function";

const PIPELINE = { pipelineId: "pm-dev-test", task: TASK, engine: "claude-code" };

let ctx: TestApp;

beforeEach(async () => {
  ctx = await createTestApp();
});

afterEach(async () => {
  await ctx.dispose();
});

/** Read a stage's handoff artifact from the run directory. */
function readHandoff(home: string, runId: string, stageId: string): Promise<string> {
  return readFile(path.join(home, "runs", runId, stageId, "handoff.md"), "utf8");
}

test("the boxes run in order, in one shared workspace, each with its own persona", async () => {
  // Arrange
  const { app, engine } = ctx;

  // Anticipate — three engine calls. Each prompt must carry what came before:
  // that handoff is the whole point of the multi-box flow.
  engine
    .anticipate({
      as: "Product Manager",
      model: "haiku",
      permissionMode: "skip",
      persona: /# Role: Product Manager/,
      prompt: /# Assignment: Plan a feature/,
    })
    .reports(PM_REPORT);
  engine
    .anticipate({
      as: "Developer",
      model: "haiku",
      persona: /# Role: Developer/,
      prompt: /MARKER-PM/,
    })
    .reports(DEV_REPORT);
  engine
    .anticipate({
      as: "QA Engineer",
      model: "haiku",
      persona: /# Role: QA Engineer/,
      prompt: /MARKER-DEVELOPER/,
    })
    .reports(TESTER_REPORT);

  // Act
  const run = await startRun(app, { ...PIPELINE, model: "haiku" });
  await approveIntake(app, run.id);

  // Assert
  const finished = await waitForRunStatus(app, run.id, "completed");
  expect(stageOf(finished, "intake").status).toBe("passed");
  expect(stageOf(finished, "implementation").status).toBe("passed");
  expect(stageOf(finished, "test").status).toBe("passed");
  engine.verify();
  // One workspace for the run, so each box sees what the last one wrote.
  expect(engine.callAt(1).cwd).toBe(engine.callAt(0).cwd);
  expect(engine.callAt(2).cwd).toBe(engine.callAt(0).cwd);
  expect(finished.workspacePath).toBe(engine.callAt(0).cwd);
});

test("each prompt quotes every upstream report under a handoff heading", async () => {
  // Arrange
  const { app, engine } = ctx;

  // Anticipate
  engine.anticipate({ as: "Product Manager" }).reports(PM_REPORT);
  engine.anticipate({ as: "Developer" }).reports(DEV_REPORT);
  engine.anticipate({ as: "QA Engineer" }).reports(TESTER_REPORT);

  // Act
  const run = await startRun(app, PIPELINE);
  await approveIntake(app, run.id);

  // Assert
  await waitForRunStatus(app, run.id, "completed");
  const testerPrompt = engine.callAt(2).prompt;
  expect(testerPrompt).toContain("## Task");
  expect(testerPrompt).toContain("## Handoff from previous steps");
  expect(testerPrompt).toContain("### Product Manager");
  expect(testerPrompt).toContain("### Developer");
  expect(testerPrompt).toContain(DEV_REPORT);
  // The Product Manager runs first: its prompt combines the reusable step task
  // with the user's request while its stable identity stays in the persona.
  expect(engine.callAt(0).prompt).toContain("# Assignment: Plan a feature");
  expect(engine.callAt(0).prompt).toContain(`## Task\n\n${TASK}`);
});

test("each box's output is stored per stage and written as its own handoff.md", async () => {
  // Arrange
  const { app, engine, home } = ctx;

  // Anticipate
  engine.anticipate({ as: "Product Manager" }).reports(PM_REPORT);
  engine.anticipate({ as: "Developer" }).reports(DEV_REPORT);
  engine.anticipate({ as: "QA Engineer" }).reports(TESTER_REPORT);

  // Act
  const run = await startRun(app, PIPELINE);
  await approveIntake(app, run.id);

  // Assert
  const finished = await waitForRunStatus(app, run.id, "completed");
  expect(finished.stageOutputs?.intake).toBe(PM_REPORT);
  expect(finished.stageOutputs?.implementation).toBe(DEV_REPORT);
  expect(finished.stageOutputs?.test).toBe(TESTER_REPORT);
  // `result` holds only the last box's output — the trap TASK-047 fell into.
  expect(finished.result).toBe(TESTER_REPORT);

  const developerHandoff = await readHandoff(home, run.id, "implementation");
  const testerHandoff = await readHandoff(home, run.id, "test");
  expect(developerHandoff).toContain("# Developer — handoff");
  expect(developerHandoff).toContain(DEV_REPORT);
  expect(developerHandoff).not.toContain("MARKER-TESTER");
  expect(testerHandoff).toContain("# QA Engineer — handoff");
  expect(testerHandoff).toContain("MARKER-TESTER");
});

test("a FAIL verdict fails the stage and the run even though the engine exited cleanly", async () => {
  // Arrange
  const { app, engine } = ctx;

  // Anticipate — QA succeeds at the process level but reports FAIL.
  engine.anticipate({ as: "Product Manager" }).reports(PM_REPORT);
  engine.anticipate({ as: "Developer" }).reports(DEV_REPORT);
  engine
    .anticipate({ as: "QA Engineer" })
    .reports("The greet function returns undefined.\n\nVERDICT: FAIL");

  // Act
  const run = await startRun(app, PIPELINE);
  await approveIntake(app, run.id);

  // Assert
  const finished = await waitForRunStatus(app, run.id, "failed");
  expect(stageOf(finished, "test").status).toBe("failed");
  expect(stageOf(finished, "test").verdict).toBe("FAIL");
  expect(stageOf(finished, "implementation").status).toBe("passed");
  engine.verify();
});

test("a PASS verdict is recorded on the verifying stage only", async () => {
  // Arrange
  const { app, engine } = ctx;

  // Anticipate
  engine.anticipate({ as: "Product Manager" }).reports(PM_REPORT);
  engine.anticipate({ as: "Developer" }).reports(DEV_REPORT);
  engine.anticipate({ as: "QA Engineer" }).reports(TESTER_REPORT);

  // Act
  const run = await startRun(app, PIPELINE);
  await approveIntake(app, run.id);

  // Assert
  const finished = await waitForRunStatus(app, run.id, "completed");
  expect(stageOf(finished, "test").verdict).toBe("PASS");
  // Neither upstream persona declares a verdict contract, so both stay undefined.
  expect(stageOf(finished, "implementation").verdict).toBeUndefined();
  expect(stageOf(finished, "intake").verdict).toBeUndefined();
});

test("a failing Developer stops the run before QA is ever called", async () => {
  // Arrange
  const { app, engine } = ctx;

  // Anticipate — two calls. verify() proves QA never ran.
  engine.anticipate({ as: "Product Manager" }).reports(PM_REPORT);
  engine.anticipate({ as: "Developer" }).fails("claude exited with code 1");

  // Act
  const run = await startRun(app, PIPELINE);
  await approveIntake(app, run.id);

  // Assert
  const finished = await waitForRunStatus(app, run.id, "failed");
  expect(stageOf(finished, "implementation").status).toBe("failed");
  expect(stageOf(finished, "test").status).toBe("pending");
  engine.verify();
});

test("aborting a run signals the engine it is running", async () => {
  // Arrange
  const { app, engine } = ctx;

  // Anticipate — the box blocks until the abort signal fires.
  engine.anticipate({ as: "Product Manager" }).hangsUntilAborted();
  const run = await startRun(app, PIPELINE);
  await engine.waitForCall(1);

  // Act
  const { status } = await post(app, `/runs/${run.id}/abort`);

  // Assert
  expect(status).toBe(200);
  const cancelled = await waitForRunStatus(app, run.id, "cancelled");
  expect(stageOf(cancelled, "implementation").status).toBe("skipped");
  expect(stageOf(cancelled, "test").status).toBe("skipped");
  expect(engine.callAt(0).signal.aborted).toBe(true);
  engine.verify();
});

test("restarting from QA keeps the upstream output and re-runs only QA", async () => {
  // Arrange
  const { app, engine } = ctx;
  engine.anticipate({ as: "Product Manager" }).reports(PM_REPORT);
  engine.anticipate({ as: "Developer" }).reports(DEV_REPORT);
  engine.anticipate({ as: "QA, first attempt" }).reports("Broken.\n\nVERDICT: FAIL");
  const run = await startRun(app, PIPELINE);
  await approveIntake(app, run.id);
  await waitForRunStatus(app, run.id, "failed");

  // Anticipate — the retry is handed the Developer's original report again,
  // proving the surviving upstream output is what feeds the re-run.
  engine
    .anticipate({ as: "QA, retry", prompt: /MARKER-DEVELOPER/ })
    .reports(TESTER_REPORT);

  // Act
  const { status } = await post(app, `/runs/${run.id}/restart`, { stageId: "test" });

  // Assert — restarting downstream of the gate must not re-open it.
  expect(status).toBe(200);
  const finished = await waitForRunStatus(app, run.id, "completed");
  expect(finished.stageOutputs?.intake).toBe(PM_REPORT);
  expect(finished.stageOutputs?.implementation).toBe(DEV_REPORT);
  expect(finished.stageOutputs?.test).toBe(TESTER_REPORT);
  expect(stageOf(finished, "test").verdict).toBe("PASS");
  engine.verify();
});

test("aborting before the box starts means the engine is never spawned at all", async () => {
  // Arrange — no anticipations: this run must not reach the engine.
  //
  // Covers the abort landing before the stage is entered, where the "skipped"
  // guard at the top of the stage step catches it. The narrower window — abort
  // arriving *during* persona resolution, after that guard — is handled by the
  // cancelled check before the adapter call, but is a genuine race and so is
  // not deterministically reproducible here.
  const { app, engine } = ctx;
  const run = await startRun(app, PIPELINE);

  // Act
  const { status } = await post(app, `/runs/${run.id}/abort`);

  // Assert
  expect(status).toBe(200);
  const cancelled = await waitForRunStatus(app, run.id, "cancelled");
  expect(stageOf(cancelled, "intake").status).toBe("skipped");
  // An engine started here would be a CLI doing paid work for a cancelled run.
  engine.verify();
});

test("restarting a stage drops its old report, so a failed retry leaves no stale handoff", async () => {
  // Arrange — a run whose QA Engineer reported, then gets restarted.
  const { app, engine } = ctx;
  engine.anticipate({ as: "Product Manager" }).reports(PM_REPORT);
  engine.anticipate({ as: "Developer" }).reports(DEV_REPORT);
  engine.anticipate({ as: "QA, first attempt" }).reports("Broken.\n\nVERDICT: FAIL");
  const run = await startRun(app, PIPELINE);
  await approveIntake(app, run.id);
  await waitForRunStatus(app, run.id, "failed");

  // Anticipate — the retry dies at the process level, producing no report at all.
  engine.anticipate({ as: "QA, retry" }).fails("claude exited with code 1");

  // Act
  await post(app, `/runs/${run.id}/restart`, { stageId: "test" });

  // Assert — the stage produced nothing this time, so it must expose nothing.
  // Leaving the previous attempt's text behind would hand a downstream box a
  // handoff describing work that no longer happened.
  const finished = await waitForRunStatus(app, run.id, "failed");
  expect(finished.stageOutputs?.test).toBeUndefined();
  expect(finished.stageOutputs?.implementation).toBe(DEV_REPORT);
  engine.verify();
});

test("an api-key connection with no stored key is rejected before a run is created", async () => {
  // Arrange
  const { app, engine } = ctx;
  await put(app, "/settings/engines/claude-code", { connectionMode: "api-key" });

  // Anticipate — no engine call: the guard must fire before the run starts.

  // Act
  const { status, body } = await post<{ error: string }>(app, "/runs", PIPELINE);

  // Assert
  expect(status).toBe(400);
  expect(body.error).toMatch(/needs an API key/);
  const { body: runs } = await get<RunState[]>(app, "/runs");
  expect(runs).toHaveLength(0);
  engine.verify();
});

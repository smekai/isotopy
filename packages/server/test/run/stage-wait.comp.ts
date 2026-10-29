// TASK-212: a stage can end its turn with an `isotopy-wait` block. Isotopy then
// sleeps durably, runs the agent's own check on a schedule, and wakes the same
// agent in its session with what the last check printed. Checks here are real
// subprocesses — `node -e` scripts — so exit codes and output are not faked.
import { realpathSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { fencedBlock } from "../support/fake-engine.ts";
import {
  createTestApp,
  get,
  post,
  restartApp,
  startRun,
  stageOf,
  waitForRunStatus,
  waitForStageStatus,
} from "../support/harness.ts";
import type { TestApp } from "../support/harness.ts";
import type { RunState } from "@isotopy/core";

const TASK = "merge the pull request once CI is green";
const SESSION = "sess-wait-1";
const DONE = "Merged.\n\nVERDICT: PASS";
const UNTIL = "CI on the pull request has settled";

const SUCCEEDS_ON_THIRD_ATTEMPT = [
  "const fs = require('node:fs');",
  "const file = process.argv[1];",
  "const count = (fs.existsSync(file) ? Number(fs.readFileSync(file, 'utf8')) : 0) + 1;",
  "fs.writeFileSync(file, String(count));",
  "if (count < 3) { console.log('checks pending'); process.exit(8); }",
  "console.log('CHECKS-GREEN all 4 checks passed');",
].join(" ");

const ALWAYS_PENDING = "console.log('CHECKS-PENDING'); process.exit(3);";

let ctx: TestApp;

beforeEach(async () => {
  ctx = await createTestApp();
});

afterEach(async () => {
  await ctx.dispose();
});

function waitBlock(wait: Record<string, unknown>): string {
  return `CI is running on the pull request.\n\n${fencedBlock("isotopy-wait", { until: UNTIL, ...wait })}`;
}

function nodeCheck(script: string, ...args: string[]) {
  return { executable: process.execPath, args: ["-e", script, ...args] };
}

function anticipateWaits(count: number): void {
  for (let index = 0; index < count; index += 1) {
    ctx.engine
      .anticipate({ as: `waiting turn ${index + 1}` })
      .parks(waitBlock({ every: "1ms" }), SESSION);
  }
}

test("a check that succeeds on its third attempt wakes the agent in its own session with what it printed", async () => {
  // Arrange
  const counter = path.join(ctx.home, "check-count.txt");
  ctx.engine
    .anticipate({ as: "Release Manager, waiting" })
    .parks(waitBlock({ check: nodeCheck(SUCCEEDS_ON_THIRD_ATTEMPT, counter), attempts: 5, every: "5ms" }), SESSION);
  ctx.engine
    .anticipate({ as: "Release Manager, woken", resumeSessionId: SESSION, prompt: /CHECKS-GREEN/ })
    .reports(DONE);
  ctx.engine.anticipateRunReview();

  // Act
  const run = await startRun(ctx.app, { pipelineId: "solo", task: TASK, engine: "claude-code" });

  // Assert
  await waitForRunStatus(ctx.app, run.id, "completed");
  ctx.engine.verify();
  expect(ctx.engine.callAt(1).prompt).toContain("succeeded on attempt 3 of 5");
});

test("a check runs in the run's workspace, where the agent's own files are", async () => {
  // Arrange — a Home run works in a per-run workspace, not in the Home project root.
  // Both sides are realpaths: on macOS the temp dir under /var is a symlink to /private/var.
  const printsCwd = nodeCheck("console.log('CHECK-CWD ' + require('node:fs').realpathSync(process.cwd()))");
  ctx.engine.anticipate({ as: "waiting" }).parks(waitBlock({ check: printsCwd, every: "1ms" }), SESSION);
  ctx.engine.anticipate({ as: "woken", resumeSessionId: SESSION }).reports(DONE);
  ctx.engine.anticipateRunReview();

  // Act
  const run = await startRun(ctx.app, { pipelineId: "solo", task: TASK, engine: "claude-code" });

  // Assert
  const completed = await waitForRunStatus(ctx.app, run.id, "completed");
  expect(ctx.engine.callAt(1).prompt).toContain(`CHECK-CWD ${realpathSync(completed.workspacePath ?? "")}`);
});

test("a wait whose check never succeeds gives up after its attempts and says so", async () => {
  // Arrange
  ctx.engine
    .anticipate({ as: "waiting" })
    .parks(waitBlock({ check: nodeCheck(ALWAYS_PENDING), attempts: 2, every: "1ms" }), SESSION);
  ctx.engine.anticipate({ as: "woken", resumeSessionId: SESSION, prompt: /CHECKS-PENDING/ }).reports(DONE);
  ctx.engine.anticipateRunReview();

  // Act
  const run = await startRun(ctx.app, { pipelineId: "solo", task: TASK, engine: "claude-code" });

  // Assert
  await waitForRunStatus(ctx.app, run.id, "completed");
  ctx.engine.verify();
  expect(ctx.engine.callAt(1).prompt).toContain("no check succeeded in 2 attempts (last exit code 3)");
});

test("a wait without a check wakes the agent once its delay has passed", async () => {
  // Arrange
  ctx.engine.anticipate({ as: "waiting" }).parks(waitBlock({ every: "5ms" }), SESSION);
  ctx.engine
    .anticipate({ as: "woken", resumeSessionId: SESSION, prompt: /that time has passed/ })
    .reports(DONE);
  ctx.engine.anticipateRunReview();

  // Act
  const run = await startRun(ctx.app, { pipelineId: "solo", task: TASK, engine: "claude-code" });

  // Assert
  await waitForRunStatus(ctx.app, run.id, "completed");
  ctx.engine.verify();
});

test("a run reads waiting, and logs what it waits for, until the wait is over", async () => {
  // Arrange
  ctx.engine.anticipate({ as: "waiting" }).parks(waitBlock({ every: "1h" }), SESSION);

  // Act
  const run = await startRun(ctx.app, { pipelineId: "solo", task: TASK, engine: "claude-code" });

  // Assert
  const waiting = await waitForStageStatus(ctx.app, run.id, "solo", "waiting");
  expect(waiting.status).toBe("waiting");
  expect(stageOf(waiting, "solo").logs.map((entry) => entry.message)).toContain(
    `Agent is waiting: ${UNTIL} — waking in 1h`,
  );
  await post(ctx.app, `/runs/${run.id}/abort`);
  await waitForRunStatus(ctx.app, run.id, "cancelled");
});

test("a wait outlives a restart of Isotopy and still wakes the agent", async () => {
  // Arrange
  ctx.engine.anticipate({ as: "waiting" }).parks(waitBlock({ every: "300ms" }), SESSION);
  ctx.engine.anticipate({ as: "woken after the restart", resumeSessionId: SESSION }).reports(DONE);
  ctx.engine.anticipateRunReview();
  const run = await startRun(ctx.app, { pipelineId: "solo", task: TASK, engine: "claude-code" });
  await waitForStageStatus(ctx.app, run.id, "solo", "waiting");
  await ctx.orchestrator.shutdown();

  // Act
  const restarted = await restartApp();

  // Assert
  const finished = await waitForRunStatus(restarted.app, run.id, "completed");
  expect(stageOf(finished, "solo").status).toBe("passed");
  ctx.engine.verify();
  await restarted.shutdown();
});

test("a stage that keeps asking to wait past the limit needs attention", async () => {
  // Arrange
  anticipateWaits(13);
  ctx.engine.anticipateRunReview();

  // Act
  const run = await startRun(ctx.app, { pipelineId: "solo", task: TASK, engine: "claude-code" });

  // Assert
  const settled = await waitForRunStatus(ctx.app, run.id, "needs_attention");
  expect(stageOf(settled, "solo").logs.map((entry) => entry.message).join("\n")).toContain(
    "asked to wait more than 12 times in one stage",
  );
  ctx.engine.verify();
});

test("an unusable wait block needs attention instead of waiting", async () => {
  // Arrange
  ctx.engine.anticipate({ as: "waiting badly" }).parks(waitBlock({ every: "soon" }), SESSION);
  ctx.engine.anticipateRunReview();

  // Act
  const run = await startRun(ctx.app, { pipelineId: "solo", task: TASK, engine: "claude-code" });

  // Assert
  const settled = await waitForRunStatus(ctx.app, run.id, "needs_attention");
  const { body } = await get<RunState>(ctx.app, `/runs/${run.id}`);
  expect(stageOf(body, "solo").logs.map((entry) => entry.message).join("\n")).toContain(
    '"soon" is not a duration like 30s, 5m or 2h',
  );
  expect(settled.status).toBe("needs_attention");
});

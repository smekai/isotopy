import { afterEach, beforeEach, expect, test } from "vitest";
import {
  approveIntake,
  createTestApp,
  post,
  stageOf,
  startRun,
  waitForRunStatus,
} from "../support/harness.ts";
import type { TestApp } from "../support/harness.ts";

const PIPELINE = {
  pipelineId: "full-delivery",
  task: "add milestone progress",
  engine: "claude-code",
};

const PLAN = "Approved milestone progress scope";
const IMPLEMENTATION = "Implemented milestone progress";
const REVIEW_PASS = "No blocking findings\n\nVERDICT: PASS";
const QA_PASS = "All required checks pass\n\nVERDICT: PASS";
const CLOSEOUT = "Captured decisions and follow-up work\n\nVERDICT: PASS";

let ctx: TestApp;

beforeEach(async () => {
  ctx = await createTestApp();
});

afterEach(async () => {
  await ctx.dispose();
});



test("the revised persona team completes one Full Delivery run", async () => {
  // Anticipate — all nine boxes, in order, each keyed to its own persona.
  anticipatePlanningAndImplementation();
  ctx.engine
    .anticipate({
      as: "Software Architect review",
      prompt: /# Assignment: Review the implementation/,
    })
    .reports(REVIEW_PASS);
  ctx.engine
    .anticipate({
      as: "QA Engineer",
      persona: /# Role: QA Engineer/,
      prompt: /Implemented milestone progress/,
    })
    .reports(QA_PASS);
  anticipateDeliveryAndCloseout();

  // Act
  const run = await startRun(ctx.app, PIPELINE);
  await approveIntake(ctx.app, run.id);

  // Assert
  const finished = await waitForRunStatus(ctx.app, run.id,"completed");
  expect(finished.stages.map((stage) => stage.status)).toEqual([
    "passed",
    "skipped",
    "skipped",
    "passed",
    "passed",
    "passed",
    "passed",
    "skipped",
    "passed",
  ]);
  expect(ctx.engine.callAt(8).cwd).toBe(ctx.engine.callAt(0).cwd);
  ctx.engine.verify();
});

test("a blocking architecture review continues through QA and closeout", async () => {
  // Anticipate — review fails, and QA must still be handed that finding.
  anticipatePlanningAndImplementation();
  ctx.engine
    .anticipate({ as: "Software Architect review" })
    .reports("Missing rollback boundary\n\nVERDICT: FAIL");
  ctx.engine
    .anticipate({ as: "QA Engineer", prompt: /Missing rollback boundary/ })
    .reports(QA_PASS);
  ctx.engine
    .anticipate({ as: "Product Manager closeout", prompt: /Missing rollback boundary/ })
    .reports(CLOSEOUT);

  // Act
  const run = await startRun(ctx.app, PIPELINE);
  await approveIntake(ctx.app, run.id);

  // Assert
  const finished = await waitForRunStatus(ctx.app, run.id,"needs_attention");
  expect(stageOf(finished, "review").status).toBe("failed");
  expect(stageOf(finished, "test").status).toBe("passed");
  expect(stageOf(finished, "release").status).toBe("skipped");
  expect(stageOf(finished, "deploy").status).toBe("skipped");
  expect(stageOf(finished, "closeout").status).toBe("passed");
  ctx.engine.verify();
});

test("an engine failure skips unsafe work but still runs closeout", async () => {
  // Anticipate — QA dies at the process level rather than reporting a verdict.
  anticipatePlanningAndImplementation();
  ctx.engine.anticipate({ as: "Software Architect review" }).reports(REVIEW_PASS);
  ctx.engine.anticipate({ as: "QA Engineer" }).fails("test runner crashed");
  ctx.engine
    .anticipate({ as: "Product Manager closeout" })
    .reports("Recorded the runtime failure\n\nVERDICT: PASS");

  // Act
  const run = await startRun(ctx.app, PIPELINE);
  await approveIntake(ctx.app, run.id);

  // Assert
  const finished = await waitForRunStatus(ctx.app, run.id,"failed");
  expect(stageOf(finished, "test").status).toBe("failed");
  expect(stageOf(finished, "release").status).toBe("skipped");
  expect(stageOf(finished, "deploy").status).toBe("skipped");
  expect(stageOf(finished, "closeout").status).toBe("passed");
  ctx.engine.verify();
});

test("restart keeps an earlier blocking review in the final outcome", async () => {
  // Anticipate — two passes over QA and closeout: the failed one, then the retry.
  anticipatePlanningAndImplementation();
  ctx.engine
    .anticipate({ as: "Software Architect review" })
    .reports("Missing rollback boundary\n\nVERDICT: FAIL");
  ctx.engine.anticipate({ as: "QA Engineer, first" }).fails("test runner crashed");
  ctx.engine
    .anticipate({ as: "Product Manager closeout, first" })
    .reports("Recorded the runtime failure\n\nVERDICT: PASS");
  const run = await startRun(ctx.app, PIPELINE);
  await approveIntake(ctx.app, run.id);
  await waitForRunStatus(ctx.app, run.id, "failed");
  ctx.engine.anticipate({ as: "QA Engineer, retry" }).reports(QA_PASS);
  ctx.engine
    .anticipate({ as: "Product Manager closeout, retry" })
    .reports(CLOSEOUT);

  // Act
  await post(ctx.app, `/runs/${run.id}/restart`, { stageId: "test" });

  // Assert — the retry must not erase the review verdict recorded before it.
  const finished = await waitForRunStatus(ctx.app, run.id, "needs_attention");
  expect(stageOf(finished, "review").status).toBe("failed");
  expect(stageOf(finished, "review").verdict).toBe("FAIL");
  expect(stageOf(finished, "release").status).toBe("skipped");
  expect(stageOf(finished, "deploy").status).toBe("skipped");
  expect(stageOf(finished, "closeout").status).toBe("passed");
  ctx.engine.verify();
});

test("cancellation never starts a paid closeout stage", async () => {
  // Anticipate — one box only; closeout reaching an engine here spends real money.
  ctx.engine.anticipate({ as: "Product Manager" }).hangsUntilAborted();
  const run = await startRun(ctx.app, PIPELINE);
  await ctx.engine.waitForCall();

  // Act
  await post(ctx.app, `/runs/${run.id}/abort`);

  // Assert
  const finished = await waitForRunStatus(ctx.app, run.id, "cancelled");
  expect(stageOf(finished, "closeout").status).toBe("skipped");
  ctx.engine.verify();
});

function anticipatePlanningAndImplementation(): void {
  ctx.engine
    .anticipate({
      as: "Product Manager",
      persona: /# Role: Product Manager/,
      prompt: /# Assignment: Plan a feature/,
    })
    .reports(PLAN);
  ctx.engine
    .anticipate({
      as: "Product Designer",
      persona: /# Role: Product Designer/,
      prompt: /# Assignment: Design the product experience/,
    })
    .reports("No UI change\n\nVERDICT: SKIP");
  ctx.engine
    .anticipate({
      as: "Software Architect design",
      persona: /# Role: Software Architect/,
      prompt: /# Assignment: Design the software architecture/,
    })
    .reports("Existing architecture applies\n\nVERDICT: SKIP");
  ctx.engine
    .anticipate({
      as: "Developer",
      persona: /# Role: Developer/,
      prompt: /Approved milestone progress scope/,
    })
    .reports(IMPLEMENTATION);
}

function anticipateDeliveryAndCloseout(): void {
  ctx.engine
    .anticipate({
      as: "Release Manager",
      persona: /# Role: Release Manager/,
      prompt: /# Assignment: Prepare the feature release/,
    })
    .reports("Release checklist ready\n\nVERDICT: PASS");
  ctx.engine
    .anticipate({
      as: "SRE",
      persona: /# Role: Site Reliability Engineer/,
      prompt: /# Assignment: Deploy the preview environment/,
    })
    .reports("No preview target\n\nVERDICT: SKIP");
  ctx.engine
    .anticipate({
      as: "Product Manager closeout",
      persona: /# Role: Product Manager/,
      prompt: /# Assignment: Close out the feature run/,
    })
    .reports(CLOSEOUT);
}

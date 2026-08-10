import { afterEach, beforeEach, expect, test } from "vitest";
import {
  approveIntake,
  createTestApp,
  post,
  put,
  stageMessage,
  stageOf,
  startRun,
  waitForRunStatus,
} from "../support/harness.ts";
import type { TestApp } from "../support/harness.ts";
import { startHealthServer } from "../support/health-server.ts";
import type { HealthServer } from "../support/health-server.ts";

const PIPELINE = {
  pipelineId: "full-delivery",
  task: "add milestone progress",
  engine: "claude-code",
};

const PLAN = "Approved milestone progress scope";
const IMPLEMENTATION = "Implemented milestone progress";
const REVIEW_PASS = "No blocking findings\n\nVERDICT: PASS";
const QA_PASS = "All required checks pass\n\nVERDICT: PASS";

const RELEASE_MANIFEST = {
  summary: "Milestone progress is ready to release",
  changes: ["Milestone progress lands on the run page"],
  changelogFragment: "Added milestone progress",
  checklist: ["Confirm the progress bar renders"],
  compatibilityNotes: [],
  deploymentInputs: [],
  rollbackNotes: [],
};

const RELEASE_PASS = `\`\`\`adhd-release\n${JSON.stringify(RELEASE_MANIFEST)}\n\`\`\`\n\nVERDICT: PASS`;

interface CloseoutReport {
  summary: string;
  deliveredScope: string[];
  decisions: string[];
  knowledge: string[];
  findings: { id: string; title: string; severity: string; evidence: string }[];
  tasks: never[];
  completedTaskIds: never[];
  unresolvedTaskIds: never[];
  cleanup: never[];
}

function closeoutReport(overrides: Partial<CloseoutReport> = {}): CloseoutReport {
  return {
    summary: overrides.summary ?? "Captured decisions and follow-up work",
    deliveredScope: overrides.deliveredScope ?? ["Milestone progress"],
    decisions: overrides.decisions ?? ["Kept the existing stage seam"],
    knowledge: overrides.knowledge ?? ["Full Delivery runs nine boxes"],
    findings: overrides.findings ?? [],
    tasks: [],
    completedTaskIds: [],
    unresolvedTaskIds: [],
    cleanup: [],
  };
}

function closeoutBlock(report: CloseoutReport): string {
  return `\`\`\`adhd-closeout\n${JSON.stringify(report)}\n\`\`\`\n\nVERDICT: PASS`;
}

const CLOSEOUT = closeoutBlock(closeoutReport());

const CLOSEOUT_AFTER_CRASH = closeoutBlock(
  closeoutReport({
    summary: "Recorded the runtime failure",
    findings: [
      {
        id: "qa-crash",
        title: "QA runner crashed before reporting",
        severity: "blocking",
        evidence: "test runner crashed",
      },
    ],
  }),
);

let ctx: TestApp;
let healthy: HealthServer | undefined;

beforeEach(async () => {
  ctx = await createTestApp();
});

afterEach(async () => {
  await healthy?.close();
  healthy = undefined;
  await ctx.dispose();
});



test("the revised persona team completes one Full Delivery run", async () => {
  // Anticipate — every box that reaches an engine, in order, keyed to its own
  // persona. The SRE box is not one of them: ADHD deploys the preview itself.
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
  // The Orchestrator is handed the Product Manager's closeout rather than being
  // left to re-derive one from nine raw stage outputs.
  ctx.engine.anticipateRunReview({
    as: "Orchestrator review",
    artifacts: { summary: "Full Delivery landed" },
  });

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
  expect(ctx.engine.callAt(7).cwd).toBe(ctx.engine.callAt(0).cwd);
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
  ctx.engine.anticipateRunReview();

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
    .reports(CLOSEOUT_AFTER_CRASH);
  ctx.engine.anticipateRunReview();

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
    .reports(CLOSEOUT_AFTER_CRASH);
  ctx.engine.anticipateRunReview({ as: "Review of the failed pass" });
  const run = await startRun(ctx.app, PIPELINE);
  await approveIntake(ctx.app, run.id);
  await waitForRunStatus(ctx.app, run.id, "failed");
  ctx.engine.anticipate({ as: "QA Engineer, retry" }).reports(QA_PASS);
  ctx.engine
    .anticipate({ as: "Product Manager closeout, retry" })
    .reports(CLOSEOUT);
  ctx.engine.anticipateRunReview({ as: "Review of the retry" });

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

test("a closeout the Product Manager wrote as prose leaves the run needing attention, not completed", async () => {
  // Anticipate — a closeout that reads like a report and carries no closeout block.
  anticipatePlanningAndImplementation();
  ctx.engine.anticipate({ as: "Software Architect review" }).reports(REVIEW_PASS);
  ctx.engine.anticipate({ as: "QA Engineer" }).reports(QA_PASS);
  ctx.engine.anticipate({ as: "Release Manager" }).reports(RELEASE_PASS);
  ctx.engine
    .anticipate({ as: "Product Manager closeout" })
    .reports("Captured decisions and follow-up work\n\nVERDICT: PASS");
  ctx.engine.anticipateRunReview();

  // Act
  const run = await startRun(ctx.app, PIPELINE);
  await approveIntake(ctx.app, run.id);

  // Assert
  const finished = await waitForRunStatus(ctx.app, run.id, "needs_attention");
  expect(stageOf(finished, "closeout").status).toBe("failed");
  expect(stageMessage(finished)).toContain("no usable closeout");
  ctx.engine.verify();
});

test("a closeout stage that returns nothing at all needs attention rather than passing on silence", async () => {
  // Anticipate — the Product Manager finishes cleanly and says nothing.
  anticipatePlanningAndImplementation();
  ctx.engine.anticipate({ as: "Software Architect review" }).reports(REVIEW_PASS);
  ctx.engine.anticipate({ as: "QA Engineer" }).reports(QA_PASS);
  ctx.engine.anticipate({ as: "Release Manager" }).reports(RELEASE_PASS);
  ctx.engine.anticipate({ as: "Product Manager closeout" }).reports("");
  ctx.engine.anticipateRunReview();

  // Act
  const run = await startRun(ctx.app, PIPELINE);
  await approveIntake(ctx.app, run.id);

  // Assert
  const finished = await waitForRunStatus(ctx.app, run.id, "needs_attention");
  expect(stageOf(finished, "closeout").status).toBe("failed");
  ctx.engine.verify();
});

test("a configured preview target is deployed by ADHD itself, without an SRE engine turn", async () => {
  // Arrange
  healthy = await startHealthServer(200);
  await put(ctx.app, "/automation", previewAutomation(healthy.url));

  // Anticipate — the SRE box is absent on purpose: the deployment is deterministic.
  anticipatePlanningAndImplementation();
  ctx.engine.anticipate({ as: "Software Architect review" }).reports(REVIEW_PASS);
  ctx.engine.anticipate({ as: "QA Engineer" }).reports(QA_PASS);
  anticipateDeliveryAndCloseout();
  ctx.engine.anticipateRunReview();

  // Act
  const run = await startRun(ctx.app, PIPELINE);
  await approveIntake(ctx.app, run.id);

  // Assert
  const finished = await waitForRunStatus(ctx.app, run.id, "completed");
  expect(stageOf(finished, "deploy").status).toBe("passed");
  expect(finished.deployment?.url).toBe(healthy.url);
  expect(finished.deployment?.healthStatus).toBe("passed");
  ctx.engine.verify();
});

test("a preview deployment that fails fails the run rather than completing it", async () => {
  // Arrange
  await put(ctx.app, "/automation", previewAutomation(undefined, ["-e", "process.exit(1)"]));

  // Anticipate
  anticipatePlanningAndImplementation();
  ctx.engine.anticipate({ as: "Software Architect review" }).reports(REVIEW_PASS);
  ctx.engine.anticipate({ as: "QA Engineer" }).reports(QA_PASS);
  ctx.engine.anticipate({ as: "Release Manager" }).reports(RELEASE_PASS);
  ctx.engine.anticipate({ as: "Product Manager closeout" }).reports(CLOSEOUT);
  ctx.engine.anticipateRunReview();

  // Act
  const run = await startRun(ctx.app, PIPELINE);
  await approveIntake(ctx.app, run.id);

  // Assert
  const finished = await waitForRunStatus(ctx.app, run.id, "failed");
  expect(stageOf(finished, "deploy").status).toBe("failed");
  expect(finished.deployment?.verdict).toBe("fail");
  ctx.engine.verify();
});

test("a release handoff written as prose fails the stage — preview automation could not read it", async () => {
  // Anticipate — the Release Manager reports PASS and omits the structured block.
  anticipatePlanningAndImplementation();
  ctx.engine.anticipate({ as: "Software Architect review" }).reports(REVIEW_PASS);
  ctx.engine.anticipate({ as: "QA Engineer" }).reports(QA_PASS);
  ctx.engine
    .anticipate({ as: "Release Manager" })
    .reports("Release checklist ready\n\nVERDICT: PASS");
  ctx.engine.anticipate({ as: "Product Manager closeout" }).reports(CLOSEOUT);
  ctx.engine.anticipateRunReview();

  // Act
  const run = await startRun(ctx.app, PIPELINE);
  await approveIntake(ctx.app, run.id);

  // Assert
  const finished = await waitForRunStatus(ctx.app, run.id, "needs_attention");
  expect(stageOf(finished, "release").status).toBe("failed");
  expect(stageMessage(finished)).toContain("no usable release handoff");
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

function previewAutomation(healthUrl?: string, args?: string[]) {
  return {
    version: 1,
    validation: [],
    preview: {
      provider: "custom",
      command: {
        executable: process.execPath,
        args: args ?? ["-e", "console.log('deployed')"],
        timeoutMs: 30_000,
      },
      ...(healthUrl === undefined ? {} : { url: healthUrl }),
      healthTimeoutMs: 2_000,
      healthIntervalMs: 100,
    },
  };
}

function anticipateDeliveryAndCloseout(): void {
  ctx.engine
    .anticipate({
      as: "Release Manager",
      persona: /# Role: Release Manager/,
      prompt: /# Assignment: Prepare the feature release/,
    })
    .reports(RELEASE_PASS);
  ctx.engine
    .anticipate({
      as: "Product Manager closeout",
      persona: /# Role: Product Manager/,
      prompt: /# Assignment: Close out the feature run/,
    })
    .reports(CLOSEOUT);
}

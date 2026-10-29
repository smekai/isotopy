// An initiative that is merged leaves through a pull request when the project
// has an `origin`: a Release Manager pushes, opens the PR with whatever the
// machine has, waits for CI with an isotopy-wait block and merges. Without an
// origin it merges locally as before. `origin` is a real bare repository; the
// Release Manager's own pushing and forge calls are the scripted engine's.
import path from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import type {
  DeploymentAutomation,
  OrchestratorDecision,
  ProjectAutomationConfig,
  RunPullRequest,
  RunState,
} from "@isotopy/core";
import {
  NO_ORIGIN,
  RELEASE_NEEDS_FIX,
  localMergeNotice,
} from "../../src/domain/rules/initiative-release.ts";
import { fencedBlock } from "../support/fake-engine.ts";
import { addBareOrigin, commitFile, fileAt, initGitRepository } from "../support/git-project.ts";
import {
  addTestProject,
  createTestApp,
  getRun,
  post,
  proposedTeam,
  put,
  waitForOrchestration,
} from "../support/harness.ts";
import type { TestApp, TestHeaders } from "../support/harness.ts";
import { startHealthServer } from "../support/health-server.ts";
import type { HealthServer } from "../support/health-server.ts";
import { TEAM_PROPOSAL, fenced } from "../support/orchestration-fixtures.ts";

test("a Release Manager pushes only the initiative's branch, waits for CI in its session, and the merge stops the initiative", async () => {
  // Arrange
  const project = await gitProjectWithOrigin("green");

  // Anticipate — the merged release is not reviewed: nothing is left to decide.
  anticipateDeliveryReviewedForMerge();
  ctx.engine
    .anticipate({ as: "Release Manager, opening the PR", prompt: /push `isotopy\/[^`]+` to `origin` — that branch and no other/ })
    .parks(CI_WAIT, RELEASE_SESSION);
  ctx.engine
    .anticipate({ as: "Release Manager, woken by CI", resumeSessionId: RELEASE_SESSION })
    .reports(released(MERGED));
  const conversation = await proposedTeam(ctx.app, project.headers);

  // Act
  await approve(conversation.orchestrationId, project.headers);

  // Assert
  const stopped = await waitForOrchestration(
    ctx.app,
    conversation.orchestrationId,
    ({ status }) => status === "stopped",
    project.headers,
  );
  const release = await getRun(ctx.app, stopped.runIds[2] ?? "");
  expect(release.pullRequest).toEqual(MERGED);
  expect(stopped.stopReason).toContain(PR_URL);
  expect(ctx.engine.callAt(4).prompt).not.toContain("Do not push");
  ctx.engine.verify();
});

test("red CI sends the failing checks back to the Developer as a fix run and leaves the pull request open", async () => {
  // Arrange
  const project = await gitProjectWithOrigin("red");

  // Anticipate — the review of the release reads the failing log and sends it back.
  anticipateDeliveryReviewedForMerge();
  ctx.engine.anticipate({ as: "Release Manager" }).reports(heldOnRedCi(RED));
  ctx.engine.anticipateRunReview({
    as: "review of the red release",
    prompt: /search finds nothing for "tea"/,
    decision: FIX_CI,
  });
  ctx.engine
    .anticipate({ as: "fixing Developer", prompt: /Make the failing search test pass/ })
    .hangsUntilAborted();
  const conversation = await proposedTeam(ctx.app, project.headers);

  // Act
  const { body: delivery } = await approve(conversation.orchestrationId, project.headers);

  // Assert
  const { runIds } = await waitForOrchestration(
    ctx.app,
    conversation.orchestrationId,
    (orchestration) => orchestration.runIds.length === 4,
    project.headers,
  );
  const [, , release, fix] = await Promise.all(runIds.map((runId) => getRun(ctx.app, runId)));
  expect(release?.pullRequest).toEqual(RED);
  expect(fix?.branch).toEqual(delivery.branch);
  await ctx.engine.waitForCall(7);
  ctx.engine.verify();
});

test("merging again after CI failed is refused, because the same commits would fail the same way", async () => {
  // Arrange
  const project = await gitProjectWithOrigin("remerge");

  // Anticipate — the review of the red release asks to merge regardless.
  anticipateDeliveryReviewedForMerge();
  ctx.engine.anticipate({ as: "Release Manager" }).reports(heldOnRedCi(RED));
  ctx.engine.anticipateRunReview({ as: "review that ignores the red CI", decision: MERGE });
  const conversation = await proposedTeam(ctx.app, project.headers);

  // Act
  await approve(conversation.orchestrationId, project.headers);

  // Assert
  const parked = await waitForOrchestration(
    ctx.app,
    conversation.orchestrationId,
    ({ status }) => status === "awaiting_user",
    project.headers,
  );
  expect(parked.decisionError).toBe(RELEASE_NEEDS_FIX);
  ctx.engine.verify();
});

test("a preview target is deployed before the pull request, and the Release Manager is handed its URL", async () => {
  // Arrange
  const project = await gitProjectWithOrigin("preview");
  healthy = await startHealthServer(200);
  await put(ctx.app, "/automation", previewConfig(reportingTarget(healthy.url)), project.headers);

  // Anticipate
  anticipateDeliveryReviewedForMerge();
  ctx.engine
    .anticipate({ as: "Release Manager", prompt: new RegExp(escaped(healthy.url)) })
    .reports(released({ ...MERGED, previewUrl: healthy.url }));
  const conversation = await proposedTeam(ctx.app, project.headers);

  // Act
  await approve(conversation.orchestrationId, project.headers);

  // Assert
  await waitForOrchestration(
    ctx.app,
    conversation.orchestrationId,
    ({ status }) => status === "stopped",
    project.headers,
  );
  ctx.engine.verify();
});

test("a repository with no origin keeps the local merge, and the run log says why", async () => {
  // Arrange
  const project = await gitProject("no-remote");

  // Anticipate — no Release Manager: nothing is pushed.
  anticipateDeliveryReviewedForMerge();
  const conversation = await proposedTeam(ctx.app, project.headers);

  // Act
  const { body: delivery } = await approve(conversation.orchestrationId, project.headers);

  // Assert
  await waitForOrchestration(
    ctx.app,
    conversation.orchestrationId,
    ({ status }) => status === "stopped",
    project.headers,
  );
  expect(await fileAt(project.root, "main", "search.ts")).toBe(SEARCH);
  expect(logMessagesOf(await getRun(ctx.app, delivery.id))).toContain(localMergeNotice(NO_ORIGIN));
  ctx.engine.verify();
});

const PR_URL = "https://github.com/acme/shop/pull/7";

const RELEASE_SESSION = "sess-release-1";

const SEARCH = "export const search = 1;";

const MERGED: RunPullRequest = { url: PR_URL, ci: "passed", mergeCommit: "4d3c2b1a" };

const RED: RunPullRequest = { url: PR_URL, ci: "failed", failingChecks: ["test"] };

const CI_WAIT = `Opened ${PR_URL}; CI is running.\n\n${fencedBlock("isotopy-wait", {
  until: "CI on the pull request has settled",
  every: "1ms",
})}`;

const MERGE: OrchestratorDecision = {
  action: "stop",
  reason: "Search is done and verified",
  merge: true,
};

const FIX_CI: OrchestratorDecision = {
  action: "start_run",
  rationale: "CI fails the search test",
  task: "Make the failing search test pass",
  fromStage: "implementation",
};

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

function released(pullRequest: RunPullRequest): string {
  return `Merged ${PR_URL}.\n\n${fencedBlock("isotopy-pull-request", pullRequest)}\n\nVERDICT: PASS`;
}

function heldOnRedCi(pullRequest: RunPullRequest): string {
  return [
    `CI failed on ${PR_URL}; the pull request stays open.`,
    'FAIL search.test.ts > search finds nothing for "tea"',
    fencedBlock("isotopy-pull-request", pullRequest),
    "VERDICT: FAIL",
  ].join("\n\n");
}

async function gitProject(name: string) {
  const project = await addTestProject(ctx.registry, name);
  await initGitRepository(project.root);
  await commitFile(project.root, "README.md", "# shop\n", "Start the shop");
  return project;
}

async function gitProjectWithOrigin(name: string) {
  const project = await gitProject(name);
  await addBareOrigin(project.root, path.join(ctx.home, `${name}-origin.git`));
  return project;
}

function anticipateDeliveryReviewedForMerge(): void {
  ctx.engine.anticipate({ as: "Orchestrator" }).reports(fenced(TEAM_PROPOSAL));
  ctx.engine
    .anticipate({ as: "Developer" })
    .commits({ "search.ts": SEARCH }, "Built search.\n\nVERDICT: PASS");
  ctx.engine.anticipate({ as: "QA Engineer" }).reports("Search works.\n\nVERDICT: PASS");
  ctx.engine.anticipateRunReview({ as: "review that ships it", decision: MERGE });
}

function approve(orchestrationId: string | undefined, headers: TestHeaders) {
  return post<RunState>(
    ctx.app,
    `/orchestrations/${orchestrationId}/approve`,
    { engine: "claude-code" },
    headers,
  );
}

function logMessagesOf(run: RunState): string[] {
  return run.stages.flatMap((stage) => stage.logs.map((log) => log.message));
}

function escaped(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function previewConfig(preview: DeploymentAutomation): ProjectAutomationConfig {
  return { version: 1, validation: [], preview };
}

function reportingTarget(url: string): DeploymentAutomation {
  return {
    provider: "custom",
    command: {
      executable: process.execPath,
      args: ["-e", `console.log("ISOTOPY_DEPLOY_URL=${url}")`],
      timeoutMs: 30_000,
    },
    healthTimeoutMs: 2_000,
    healthIntervalMs: 100,
  };
}

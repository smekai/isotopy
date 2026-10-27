// An initiative that is merged leaves through a pull request when the project
// has a GitHub remote and a signed-in `gh`: Isotopy pushes, opens the PR, waits
// for CI and merges. Without either, it merges locally as before. `origin` and
// `gh` are the substituted boundary (FakeGitHub); git itself is real.
import { afterEach, beforeEach, expect, test } from "vitest";
import type {
  DeploymentAutomation,
  OrchestratorDecision,
  ProjectAutomationConfig,
  RunState,
} from "@isotopy/core";
import {
  RELEASE_NEEDS_FIX,
  cliRefusal,
  localMergeNotice,
  remoteRefusal,
} from "../../src/domain/rules/pull-request-release.ts";
import { FakeGitHub } from "../support/fake-github.ts";
import { commitFile, currentBranch, fileAt, initGitRepository } from "../support/git-project.ts";
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

test("green CI merges the pull request and brings the local base up to date", async () => {
  // Arrange
  const project = await gitProject("green");
  github.hasOrigin(ORIGIN).isSignedIn().acceptsPush().opensPullRequest(PR_URL);
  github.reportsChecks([{ name: "test", bucket: "pending" }], [{ name: "test", bucket: "pass" }]);
  github.mergesAs(MERGE_COMMIT);

  // Anticipate — the merged release is not reviewed: nothing is left to decide.
  anticipateDeliveryReviewedForMerge();
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
  expect(release.pullRequest).toEqual({ url: PR_URL, ci: "passed", mergeCommit: MERGE_COMMIT });
  expect(github.ran("gh", "pr", "merge", PR_URL, "--merge")).toBe(true);
  expect(github.ran("git", "pull", "--ff-only", "origin", "main")).toBe(true);
  expect(await currentBranch(project.root)).toBe("main");
  ctx.engine.verify();
});

test("red CI sends the failing checks back to the Developer as a fix run and leaves the pull request open", async () => {
  // Arrange
  const project = await gitProject("red");
  github.hasOrigin(ORIGIN).isSignedIn().acceptsPush().opensPullRequest(PR_URL);
  github.reportsChecks([{ name: "test", bucket: "fail", link: FAILED_RUN_LINK }]);
  github.printsFailedLog(FAILED_LOG);

  // Anticipate — the review of the release reads the failing log and sends it back.
  anticipateDeliveryReviewedForMerge();
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
  expect(release?.pullRequest).toEqual({ url: PR_URL, ci: "failed", failingChecks: ["test"] });
  expect(github.ran("gh", "pr", "merge")).toBe(false);
  expect(fix?.branch).toEqual(delivery.branch);
  await ctx.engine.waitForCall(6);
  ctx.engine.verify();
});

test("merging again after CI failed is refused, because the same commits would fail the same way", async () => {
  // Arrange
  const project = await gitProject("remerge");
  github.hasOrigin(ORIGIN).isSignedIn().acceptsPush().opensPullRequest(PR_URL);
  github.reportsChecks([{ name: "test", bucket: "fail" }]);

  // Anticipate — the review of the red release asks to merge regardless.
  anticipateDeliveryReviewedForMerge();
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
  expect(github.ran("gh", "pr", "merge")).toBe(false);
  ctx.engine.verify();
});

test("a preview target is deployed for the pull request and its URL is in the description", async () => {
  // Arrange
  const project = await gitProject("preview");
  healthy = await startHealthServer(200);
  await put(ctx.app, "/automation", previewConfig(reportingTarget(healthy.url)), project.headers);
  github.hasOrigin(ORIGIN).isSignedIn().acceptsPush().opensPullRequest(PR_URL);
  github.reportsChecks([{ name: "test", bucket: "pass" }]).mergesAs(MERGE_COMMIT);

  // Anticipate
  anticipateDeliveryReviewedForMerge();
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
  expect(await github.pullRequestBody()).toContain(healthy.url);
  ctx.engine.verify();
});

test("a repository with no remote keeps the local merge, and the run log says why", async () => {
  // Arrange — no origin is scripted, so real git finds none.
  const project = await gitProject("no-remote");

  // Anticipate
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
  expect(logMessagesOf(await getRun(ctx.app, delivery.id))).toContain(
    localMergeNotice(remoteRefusal(undefined) ?? ""),
  );
  expect(github.ran("git", "push")).toBe(false);
  ctx.engine.verify();
});

test("gh missing is reported on the run and the initiative still merges locally", async () => {
  // Arrange — a GitHub remote, but no `gh` answers.
  const project = await gitProject("no-gh");
  github.hasOrigin(ORIGIN);

  // Anticipate
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
  expect(logMessagesOf(await getRun(ctx.app, delivery.id))).toContain(
    localMergeNotice(cliRefusal("missing") ?? ""),
  );
  ctx.engine.verify();
});

const ORIGIN = "git@github.com:acme/shop.git";

const PR_URL = "https://github.com/acme/shop/pull/7";

const MERGE_COMMIT = "4d3c2b1a";

const FAILED_RUN_LINK = "https://github.com/acme/shop/actions/runs/42/job/1";

const FAILED_LOG = 'FAIL search.test.ts > search finds nothing for "tea"';

const SEARCH = "export const search = 1;";

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
let github: FakeGitHub;
let healthy: HealthServer | undefined;

beforeEach(async () => {
  github = new FakeGitHub();
  ctx = await createTestApp({ subprocess: github.runner });
});

afterEach(async () => {
  await healthy?.close();
  healthy = undefined;
  await ctx.dispose();
});

async function gitProject(name: string) {
  const project = await addTestProject(ctx.registry, name);
  await initGitRepository(project.root);
  await commitFile(project.root, "README.md", "# shop\n", "Start the shop");
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

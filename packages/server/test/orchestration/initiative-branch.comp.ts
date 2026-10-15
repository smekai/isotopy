// An initiative works on a branch of its own: its first team run cuts it from
// whatever is checked out, every later run returns to it, and the Orchestrator
// decides at the end whether it is merged back. These run against real
// temporary repositories, because what matters is what git ends up holding.
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { PROJECT_HEADER } from "@isotopy/core";
import type {
  Orchestration,
  OrchestrationStatus,
  OrchestratorDecision,
  OrchestratorTeamProposal,
  RunState,
} from "@isotopy/core";
import { NOTHING_TO_MERGE } from "../../src/domain/rules/initiative-branch.ts";
import { activeRunOf } from "../support/active-runs.ts";
import { fencedBlock } from "../support/fake-engine.ts";
import {
  branchNames,
  commitFile,
  createBranch,
  currentBranch,
  fileAt,
  initGitRepository,
} from "../support/git-project.ts";
import {
  addTestProject,
  createTestApp,
  get,
  getRun,
  post,
  waitForRunStatus,
} from "../support/harness.ts";
import type { TestApp, TestHeaders } from "../support/harness.ts";

test("the first team run of an initiative cuts its own branch from the one checked out", async () => {
  // Arrange
  const project = await addTestProject(ctx.registry, "cuts");
  await initGitRepository(project.root);
  await commitFile(project.root, "README.md", "# app\n", "Start the app");

  // Anticipate — the Developer is told the branch it works on.
  ctx.engine.anticipate({ as: "Orchestrator" }).reports(PROPOSAL);
  ctx.engine.anticipate({ as: "Developer", prompt: INITIATIVE_BRANCH }).hangsUntilAborted();
  const conversation = await settledConversation(project.headers);

  // Act
  const { body: run } = await post<RunState>(
    ctx.app,
    `/orchestrations/${conversation.orchestrationId}/approve`,
    { engine: "claude-code" },
    project.headers,
  );

  // Assert
  const branch = `isotopy/${conversation.orchestrationId}`;
  expect(run.branch).toEqual({ name: branch, base: "main" });
  expect(await currentBranch(project.root)).toBe(branch);
  await ctx.engine.waitForCall(2);
  ctx.engine.verify();
});

test("an initiative that never ran a team leaves no branch behind", async () => {
  // Arrange
  const project = await addTestProject(ctx.registry, "talks");
  await initGitRepository(project.root);
  await commitFile(project.root, "README.md", "# app\n", "Start the app");

  // Anticipate — the Orchestrator's own conversation changes no files.
  ctx.engine.anticipate({ as: "Orchestrator" }).reports(NOTHING_TO_DO);

  // Act
  const { body: conversation } = await post<RunState>(
    ctx.app,
    "/orchestrations",
    { goal: GOAL, engine: "claude-code" },
    project.headers,
  );

  // Assert
  await waitForOrchestrationStatus(conversation, "stopped", project.headers);
  expect(await branchNames(project.root)).toEqual(["main"]);
  ctx.engine.verify();
});

test("a branch that cannot be entered refuses the run and frees the project for the next one", async () => {
  // Arrange — a branch of the initiative's name already exists, so it cannot be cut.
  const project = await addTestProject(ctx.registry, "blocked");
  await initGitRepository(project.root);
  await commitFile(project.root, "README.md", "# app\n", "Start the app");

  // Anticipate
  ctx.engine.anticipate({ as: "Orchestrator" }).reports(PROPOSAL);
  const conversation = await settledConversation(project.headers);
  await createBranch(project.root, `isotopy/${conversation.orchestrationId}`);

  // Act
  const refused = await post<{ error: string }>(
    ctx.app,
    `/orchestrations/${conversation.orchestrationId}/approve`,
    { engine: "claude-code" },
    project.headers,
  );

  // Assert
  expect(refused.status).not.toBe(201);
  expect(await activeRunOf(ctx.registry, project.id)).toBeUndefined();
  ctx.engine.verify();
});

test("a fix run of the same initiative works on the branch the first run cut", async () => {
  // Arrange
  const project = await addTestProject(ctx.registry, "fixes");
  await initGitRepository(project.root);
  await commitFile(project.root, "README.md", "# app\n", "Start the app");

  // Anticipate
  ctx.engine.anticipate({ as: "Orchestrator" }).reports(PROPOSAL);
  ctx.engine.anticipate({ as: "Developer" }).commits({ "search.ts": SEARCH }, BUILT);
  ctx.engine.anticipate({ as: "QA Engineer" }).reports("Search finds nothing.\n\nVERDICT: FAIL");
  ctx.engine.anticipateRunReview({ as: "review sending the fix back", decision: FIX_RUN });
  ctx.engine.anticipate({ as: "fixing Developer" }).hangsUntilAborted();
  const conversation = await settledConversation(project.headers);

  // Act
  const { body: first } = await post<RunState>(
    ctx.app,
    `/orchestrations/${conversation.orchestrationId}/approve`,
    { engine: "claude-code" },
    project.headers,
  );

  // Assert
  const fix = await waitForOrchestrationRuns(conversation, 3, project.headers);
  expect((await getRun(ctx.app, fix)).branch).toEqual(first.branch);
  expect(await branchNames(project.root)).toEqual([`isotopy/${conversation.orchestrationId}`, "main"]);
  await ctx.engine.waitForCall(5);
  ctx.engine.verify();
});

test("a project folder inside another repository is not branched, so that repository is left alone", async () => {
  // Arrange — git would happily branch the enclosing repository from a subfolder.
  const outer = await addTestProject(ctx.registry, "outer");
  await initGitRepository(outer.root);
  await commitFile(outer.root, "README.md", "# outer\n", "Start the outer repository");
  const nestedRoot = path.join(outer.root, "app");
  await mkdir(nestedRoot);
  const nested = await ctx.registry.add(nestedRoot);
  const headers = { [PROJECT_HEADER]: nested.id };

  // Anticipate
  ctx.engine.anticipate({ as: "Orchestrator" }).reports(PROPOSAL);
  ctx.engine.anticipate({ as: "Developer" }).hangsUntilAborted();
  const conversation = await settledConversation(headers);

  // Act
  const { body: run } = await post<RunState>(
    ctx.app,
    `/orchestrations/${conversation.orchestrationId}/approve`,
    { engine: "claude-code" },
    headers,
  );

  // Assert
  expect(run.branch).toBeUndefined();
  expect(await branchNames(outer.root)).toEqual(["main"]);
});

test("stopping with merge lands the initiative's commits on its base and deletes the branch", async () => {
  // Arrange
  const project = await addTestProject(ctx.registry, "merges");
  await initGitRepository(project.root);
  await commitFile(project.root, "README.md", "# app\n", "Start the app");

  // Anticipate
  ctx.engine.anticipate({ as: "Orchestrator" }).reports(PROPOSAL);
  ctx.engine.anticipate({ as: "Developer" }).commits({ "search.ts": SEARCH }, BUILT);
  ctx.engine.anticipate({ as: "QA Engineer" }).reports(VERIFIED);
  ctx.engine.anticipateRunReview({
    as: "review that ships it, told the branch it would merge",
    prompt: INITIATIVE_BRANCH,
    decision: MERGE,
  });
  const conversation = await settledConversation(project.headers);

  // Act
  await post<RunState>(
    ctx.app,
    `/orchestrations/${conversation.orchestrationId}/approve`,
    { engine: "claude-code" },
    project.headers,
  );

  // Assert
  await waitForOrchestrationStatus(conversation, "stopped", project.headers);
  expect(await currentBranch(project.root)).toBe("main");
  expect(await fileAt(project.root, "main", "search.ts")).toBe(SEARCH);
  expect(await branchNames(project.root)).toEqual(["main"]);
  ctx.engine.verify();
});

test("a merge git refuses parks the initiative on its owner, still on its branch", async () => {
  // Arrange
  const project = await addTestProject(ctx.registry, "refused");
  await initGitRepository(project.root);
  await commitFile(project.root, "README.md", "# app\n", "Start the app");

  // Anticipate — QA leaves an edit uncommitted over the Developer's commit, so
  // checking out the base would overwrite it and git refuses.
  ctx.engine.anticipate({ as: "Orchestrator" }).reports(PROPOSAL);
  ctx.engine.anticipate({ as: "Developer" }).commits({ "README.md": "# app, searchable\n" }, BUILT);
  ctx.engine.anticipate({ as: "QA Engineer" }).writes({ "README.md": "# app, half-edited\n" }, VERIFIED);
  ctx.engine.anticipateRunReview({ as: "review that ships it", decision: MERGE });
  const conversation = await settledConversation(project.headers);

  // Act
  await post<RunState>(
    ctx.app,
    `/orchestrations/${conversation.orchestrationId}/approve`,
    { engine: "claude-code" },
    project.headers,
  );

  // Assert
  await waitForOrchestrationStatus(conversation, "awaiting_user", project.headers);
  expect(await currentBranch(project.root)).toBe(`isotopy/${conversation.orchestrationId}`);
  ctx.engine.verify();
});

test("stopping without merge returns to the base and keeps the branch for the owner", async () => {
  // Arrange
  const project = await addTestProject(ctx.registry, "keeps");
  await initGitRepository(project.root);
  await commitFile(project.root, "README.md", "# app\n", "Start the app");

  // Anticipate
  ctx.engine.anticipate({ as: "Orchestrator" }).reports(PROPOSAL);
  ctx.engine.anticipate({ as: "Developer" }).commits({ "search.ts": SEARCH }, BUILT);
  ctx.engine.anticipate({ as: "QA Engineer" }).reports(VERIFIED);
  ctx.engine.anticipateRunReview({ as: "review that holds it back", decision: STOP });
  const conversation = await settledConversation(project.headers);

  // Act
  await post<RunState>(
    ctx.app,
    `/orchestrations/${conversation.orchestrationId}/approve`,
    { engine: "claude-code" },
    project.headers,
  );

  // Assert
  await waitForOrchestrationStatus(conversation, "stopped", project.headers);
  expect(await currentBranch(project.root)).toBe("main");
  expect(await branchNames(project.root)).toEqual([`isotopy/${conversation.orchestrationId}`, "main"]);
  ctx.engine.verify();
});

test("a merge asked for where the initiative has no branch is refused, and the owner is asked", async () => {
  // Arrange — the home project runs in a scratch folder that is no repository.
  const home: TestHeaders = {};

  // Anticipate
  ctx.engine.anticipate({ as: "Orchestrator" }).reports(PROPOSAL);
  ctx.engine.anticipate({ as: "Developer" }).reports(BUILT);
  ctx.engine.anticipate({ as: "QA Engineer" }).reports(VERIFIED);
  ctx.engine.anticipateRunReview({ as: "review that ships it", decision: MERGE });
  const conversation = await settledConversation(home);

  // Act
  await post<RunState>(
    ctx.app,
    `/orchestrations/${conversation.orchestrationId}/approve`,
    { engine: "claude-code" },
    home,
  );

  // Assert
  const parked = await waitForOrchestrationStatus(conversation, "awaiting_user", home);
  expect(parked.decisionError).toBe(NOTHING_TO_MERGE);
  ctx.engine.verify();
});

const GOAL = "Add search to the product";

const SEARCH = "export const search = 1;";

const BUILT = "Built search.\n\nVERDICT: PASS";

const VERIFIED = "Search works.\n\nVERDICT: PASS";

const INITIATIVE_BRANCH = /isotopy\/[0-9a-f]{8}/;

const TEAM: OrchestratorTeamProposal = {
  name: "Delivery pair",
  summary: "Build search and verify it",
  roles: [
    { id: "implementation", label: "Developer", skill: "developer", stepTask: "implement-feature" },
    {
      id: "test",
      label: "QA Engineer",
      skill: "tester",
      stepTask: "verify-feature",
      executionPolicy: "quality",
    },
  ],
};

const PROPOSAL = fencedBlock("isotopy-orchestrator-decision", {
  action: "propose_team",
  rationale: "One Developer and one QA Engineer cover this",
  team: TEAM,
} satisfies OrchestratorDecision);

const NOTHING_TO_DO = fencedBlock("isotopy-orchestrator-decision", {
  action: "stop",
  reason: "Search already exists",
} satisfies OrchestratorDecision);

const FIX_RUN: OrchestratorDecision = {
  action: "start_run",
  rationale: "Search returns nothing for the seeded rows",
  task: "Make search find the seeded rows",
  fromStage: "implementation",
};

const MERGE: OrchestratorDecision = {
  action: "stop",
  reason: "Search is done and verified",
  merge: true,
};

const STOP: OrchestratorDecision = {
  action: "stop",
  reason: "The owner wants to look before it lands",
};

let ctx: TestApp;

beforeEach(async () => {
  ctx = await createTestApp();
});

afterEach(async () => {
  await ctx.dispose();
});

async function settledConversation(headers: TestHeaders): Promise<RunState> {
  const { status, body: run } = await post<RunState>(
    ctx.app,
    "/orchestrations",
    { goal: GOAL, engine: "claude-code" },
    headers,
  );
  expect(status, `POST /orchestrations returned ${JSON.stringify(run)}`).toBe(201);
  await waitForRunStatus(ctx.app, run.id, "completed");
  return run;
}

async function readOrchestration(
  conversation: RunState,
  headers: TestHeaders,
): Promise<Orchestration> {
  const { body } = await get<Orchestration>(
    ctx.app,
    `/orchestrations/${conversation.orchestrationId}`,
    headers,
  );
  return body;
}

async function waitForOrchestration(
  conversation: RunState,
  headers: TestHeaders,
  holds: (orchestration: Orchestration) => boolean,
): Promise<Orchestration> {
  const deadline = Date.now() + 10_000;
  let orchestration = await readOrchestration(conversation, headers);
  while (!holds(orchestration) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    orchestration = await readOrchestration(conversation, headers);
  }
  expect(holds(orchestration), JSON.stringify(orchestration, null, 2)).toBe(true);
  return orchestration;
}

function waitForOrchestrationStatus(
  conversation: RunState,
  status: OrchestrationStatus,
  headers: TestHeaders,
): Promise<Orchestration> {
  return waitForOrchestration(conversation, headers, (orchestration) => orchestration.status === status);
}

async function waitForOrchestrationRuns(
  conversation: RunState,
  count: number,
  headers: TestHeaders,
): Promise<string> {
  const settled = await waitForOrchestration(
    conversation,
    headers,
    (orchestration) => orchestration.runIds.length >= count,
  );
  return settled.runIds.at(-1) ?? "";
}

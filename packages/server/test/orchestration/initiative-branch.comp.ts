// An initiative works on a branch of its own: its first team run cuts it from
// whatever is checked out, every later run returns to it, and the Orchestrator
// decides at the end whether it is merged back. These run against real
// temporary repositories, because what matters is what git ends up holding.
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { PROJECT_HEADER } from "@isotopy/core";
import type { OrchestratorDecision } from "@isotopy/core";
import { NOTHING_TO_MERGE } from "../../src/domain/rules/initiative-branch.ts";
import { activeRunOf } from "../support/active-runs.ts";
import {
  branchNames,
  commitFile,
  createBranch,
  currentBranch,
  fileAt,
  initGitRepository,
  switchToNewBranch,
} from "../support/git-project.ts";
import {
  addTestProject,
  createTestApp,
  getRun,
  post,
  startOrchestration,
  teamRunOf,
  waitForOrchestration,
  waitForOrchestrationRun,
  waitForStageStatus,
} from "../support/harness.ts";
import type { TestApp } from "../support/harness.ts";
import {
  fenced,
  projectDataDir,
  START_PAIR,
  writeTeam,
} from "../support/orchestration-fixtures.ts";

test("the first team run of an initiative cuts its own branch from the one checked out", async () => {
  // Arrange
  const project = await addTestProject(ctx.registry, "cuts");
  await writeTeam(projectDataDir(project.root));
  await initGitRepository(project.root);
  await commitFile(project.root, "README.md", "# app\n", "Start the app");

  // Anticipate — the Developer is told the branch it works on.
  ctx.engine.anticipate({ as: "Orchestrator" }).reports(fenced(START_PAIR));
  ctx.engine.anticipate({ as: "Developer", prompt: INITIATIVE_BRANCH }).hangsUntilAborted();

  // Act
  const conversation = await startOrchestration(ctx.app, project.headers);
  const run = await teamRunOf(ctx.app, conversation, project.headers);

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
  await writeTeam(projectDataDir(project.root));
  await initGitRepository(project.root);
  await commitFile(project.root, "README.md", "# app\n", "Start the app");

  // Anticipate — the Orchestrator's own conversation changes no files.
  ctx.engine.anticipate({ as: "Orchestrator" }).reports(fenced(NOTHING_TO_DO));

  // Act
  const conversation = await startOrchestration(ctx.app, project.headers);

  // Assert
  await waitForOrchestration(
    ctx.app,
    conversation.orchestrationId,
    ({ status }) => status === "stopped",
    project.headers,
  );
  expect(await branchNames(project.root)).toEqual(["main"]);
  ctx.engine.verify();
});

test("a branch that cannot be entered refuses the run and frees the project for the next one", async () => {
  // Arrange — a branch of the initiative's name already exists, so it cannot be cut.
  const project = await addTestProject(ctx.registry, "blocked");
  await writeTeam(projectDataDir(project.root));
  await initGitRepository(project.root);
  await commitFile(project.root, "README.md", "# app\n", "Start the app");

  // Anticipate — the Orchestrator asks first, so the branch can be taken before it decides.
  ctx.engine.anticipate({ as: "Orchestrator" }).parks(fenced(ASK), ORCHESTRATOR_SESSION);
  ctx.engine
    .anticipate({ as: "Orchestrator, answered", resumeSessionId: ORCHESTRATOR_SESSION })
    .reports(fenced(START_PAIR));
  const conversation = await startOrchestration(ctx.app, project.headers);
  await waitForStageStatus(ctx.app, conversation.id, "orchestrate", "asking");
  await createBranch(project.root, `isotopy/${conversation.orchestrationId}`);

  // Act
  await post(ctx.app, `/runs/${conversation.id}/messages`, { text: "Postgres" }, project.headers);

  // Assert
  const parked = await waitForOrchestration(
    ctx.app,
    conversation.orchestrationId,
    ({ decisionError }) => decisionError !== undefined,
    project.headers,
  );
  expect(parked.status).toBe("awaiting_user");
  expect(await activeRunOf(ctx.registry, project.id)).toBeUndefined();
  ctx.engine.verify();
});

test("a new initiative will not cut its branch from one an earlier initiative left checked out", async () => {
  // Arrange — a Stop that could not switch back leaves the checkout on the old
  // initiative's branch; cutting from it would merge the new work into the old.
  const project = await addTestProject(ctx.registry, "leftover");
  await writeTeam(projectDataDir(project.root));
  await initGitRepository(project.root);
  await commitFile(project.root, "README.md", "# app\n", "Start the app");
  await switchToNewBranch(project.root, LEFTOVER_BRANCH);

  // Anticipate
  ctx.engine.anticipate({ as: "Orchestrator" }).reports(fenced(START_PAIR));

  // Act
  const conversation = await startOrchestration(ctx.app, project.headers);

  // Assert
  const parked = await waitForOrchestration(
    ctx.app,
    conversation.orchestrationId,
    ({ decisionError }) => decisionError !== undefined,
    project.headers,
  );
  expect(parked.decisionError).toContain(LEFTOVER_BRANCH);
  expect(await branchNames(project.root)).toEqual([LEFTOVER_BRANCH, "main"]);
  ctx.engine.verify();
});

test("a fix run of the same initiative works on the branch the first run cut", async () => {
  // Arrange
  const project = await addTestProject(ctx.registry, "fixes");
  await writeTeam(projectDataDir(project.root));
  await initGitRepository(project.root);
  await commitFile(project.root, "README.md", "# app\n", "Start the app");

  // Anticipate
  ctx.engine.anticipate({ as: "Orchestrator" }).reports(fenced(START_PAIR));
  ctx.engine.anticipate({ as: "Developer" }).commits({ "search.ts": SEARCH }, BUILT);
  ctx.engine.anticipate({ as: "QA Engineer" }).reports("Search finds nothing.\n\nVERDICT: FAIL");
  ctx.engine.anticipateRunReview({ as: "review sending the fix back", decision: FIX_RUN });
  ctx.engine.anticipate({ as: "fixing Developer" }).hangsUntilAborted();

  // Act
  const conversation = await startOrchestration(ctx.app, project.headers);
  const first = await teamRunOf(ctx.app, conversation, project.headers);

  // Assert
  const fix = await waitForOrchestrationRun(ctx.app, conversation.orchestrationId, 3, project.headers);
  expect((await getRun(ctx.app, fix)).branch).toEqual(first.branch);
  expect(await branchNames(project.root)).toEqual([`isotopy/${conversation.orchestrationId}`, "main"]);
  await ctx.engine.waitForCall(5);
  ctx.engine.verify();
});

test("a project folder inside another repository is not branched, so that repository is left alone", async () => {
  // Arrange — git would happily branch the enclosing repository from a subfolder.
  const outer = await addTestProject(ctx.registry, "outer");
  await writeTeam(projectDataDir(outer.root));
  await initGitRepository(outer.root);
  await commitFile(outer.root, "README.md", "# outer\n", "Start the outer repository");
  const nestedRoot = path.join(outer.root, "app");
  await mkdir(nestedRoot);
  const nested = await ctx.registry.add(nestedRoot);
  await writeTeam(projectDataDir(nestedRoot));
  const headers = { [PROJECT_HEADER]: nested.id };

  // Anticipate
  ctx.engine.anticipate({ as: "Orchestrator" }).reports(fenced(START_PAIR));
  ctx.engine.anticipate({ as: "Developer" }).hangsUntilAborted();

  // Act
  const conversation = await startOrchestration(ctx.app, headers);
  const run = await teamRunOf(ctx.app, conversation, headers);

  // Assert
  expect(run.branch).toBeUndefined();
  expect(await branchNames(outer.root)).toEqual(["main"]);
});

test("stopping with merge lands the initiative's commits on its base and deletes the branch", async () => {
  // Arrange
  const project = await addTestProject(ctx.registry, "merges");
  await writeTeam(projectDataDir(project.root));
  await initGitRepository(project.root);
  await commitFile(project.root, "README.md", "# app\n", "Start the app");

  // Anticipate
  ctx.engine.anticipate({ as: "Orchestrator" }).reports(fenced(START_PAIR));
  ctx.engine.anticipate({ as: "Developer" }).commits({ "search.ts": SEARCH }, BUILT);
  ctx.engine.anticipate({ as: "QA Engineer" }).reports(VERIFIED);
  ctx.engine.anticipateRunReview({
    as: "review that ships it, told the branch it would merge",
    prompt: INITIATIVE_BRANCH,
    decision: MERGE,
  });

  // Act
  const conversation = await startOrchestration(ctx.app, project.headers);
  await teamRunOf(ctx.app, conversation, project.headers);

  // Assert
  await waitForOrchestration(
    ctx.app,
    conversation.orchestrationId,
    ({ status }) => status === "stopped",
    project.headers,
  );
  expect(await currentBranch(project.root)).toBe("main");
  expect(await fileAt(project.root, "main", "search.ts")).toBe(SEARCH);
  expect(await branchNames(project.root)).toEqual(["main"]);
  ctx.engine.verify();
});

test("a merge git refuses parks the initiative on its owner, still on its branch", async () => {
  // Arrange
  const project = await addTestProject(ctx.registry, "refused");
  await writeTeam(projectDataDir(project.root));
  await initGitRepository(project.root);
  await commitFile(project.root, "README.md", "# app\n", "Start the app");

  // Anticipate — QA leaves an edit uncommitted over the Developer's commit, so
  // checking out the base would overwrite it and git refuses.
  ctx.engine.anticipate({ as: "Orchestrator" }).reports(fenced(START_PAIR));
  ctx.engine.anticipate({ as: "Developer" }).commits({ "README.md": "# app, searchable\n" }, BUILT);
  ctx.engine.anticipate({ as: "QA Engineer" }).writes({ "README.md": "# app, half-edited\n" }, VERIFIED);
  ctx.engine.anticipateRunReview({ as: "review that ships it", decision: MERGE });

  // Act
  const conversation = await startOrchestration(ctx.app, project.headers);
  await teamRunOf(ctx.app, conversation, project.headers);

  // Assert
  await waitForOrchestration(
    ctx.app,
    conversation.orchestrationId,
    ({ status }) => status === "awaiting_user",
    project.headers,
  );
  expect(await currentBranch(project.root)).toBe(`isotopy/${conversation.orchestrationId}`);
  ctx.engine.verify();
});

test("stopping without merge returns to the base and keeps the branch for the owner", async () => {
  // Arrange
  const project = await addTestProject(ctx.registry, "keeps");
  await writeTeam(projectDataDir(project.root));
  await initGitRepository(project.root);
  await commitFile(project.root, "README.md", "# app\n", "Start the app");

  // Anticipate
  ctx.engine.anticipate({ as: "Orchestrator" }).reports(fenced(START_PAIR));
  ctx.engine.anticipate({ as: "Developer" }).commits({ "search.ts": SEARCH }, BUILT);
  ctx.engine.anticipate({ as: "QA Engineer" }).reports(VERIFIED);
  ctx.engine.anticipateRunReview({ as: "review that holds it back", decision: STOP });

  // Act
  const conversation = await startOrchestration(ctx.app, project.headers);
  await teamRunOf(ctx.app, conversation, project.headers);

  // Assert
  await waitForOrchestration(
    ctx.app,
    conversation.orchestrationId,
    ({ status }) => status === "stopped",
    project.headers,
  );
  expect(await currentBranch(project.root)).toBe("main");
  expect(await branchNames(project.root)).toEqual([`isotopy/${conversation.orchestrationId}`, "main"]);
  ctx.engine.verify();
});

test("the owner's Stop returns the checkout to the branch the initiative was cut from", async () => {
  // Arrange
  const project = await addTestProject(ctx.registry, "owner-stops");
  await writeTeam(projectDataDir(project.root));
  await initGitRepository(project.root);
  await commitFile(project.root, "README.md", "# app\n", "Start the app");

  // Anticipate — the Developer is still working when the owner stops it all.
  ctx.engine.anticipate({ as: "Orchestrator" }).reports(fenced(START_PAIR));
  ctx.engine.anticipate({ as: "Developer" }).hangsUntilAborted();
  const conversation = await startOrchestration(ctx.app, project.headers);
  await teamRunOf(ctx.app, conversation, project.headers);
  await ctx.engine.waitForCall(2);

  // Act
  await post(ctx.app, `/orchestrations/${conversation.orchestrationId}/stop`, undefined, project.headers);

  // Assert
  expect(await currentBranch(project.root)).toBe("main");
  ctx.engine.verify();
});

test("an initiative superseded by a new one returns the checkout to the branch it was cut from", async () => {
  // Arrange
  const project = await addTestProject(ctx.registry, "superseded");
  await writeTeam(projectDataDir(project.root));
  await initGitRepository(project.root);
  await commitFile(project.root, "README.md", "# app\n", "Start the app");

  // Anticipate — the owner starts a new goal while the first team is still working.
  ctx.engine.anticipate({ as: "Orchestrator" }).reports(fenced(START_PAIR));
  ctx.engine.anticipate({ as: "Developer" }).hangsUntilAborted();
  ctx.engine.anticipate({ as: "the next Orchestrator" }).hangsUntilAborted();
  const conversation = await startOrchestration(ctx.app, project.headers);
  await teamRunOf(ctx.app, conversation, project.headers);
  await ctx.engine.waitForCall(2);

  // Act
  await startOrchestration(ctx.app, project.headers);

  // Assert
  expect(await currentBranch(project.root)).toBe("main");
});

test("a merge asked for where the initiative has no branch is refused, and the owner is asked", async () => {
  // Arrange
  await writeTeam(ctx.home);

  // Anticipate — the home project runs in a scratch folder that is no repository.
  ctx.engine.anticipate({ as: "Orchestrator" }).reports(fenced(START_PAIR));
  ctx.engine.anticipate({ as: "Developer" }).reports(BUILT);
  ctx.engine.anticipate({ as: "QA Engineer" }).reports(VERIFIED);
  ctx.engine.anticipateRunReview({ as: "review that ships it", decision: MERGE });

  // Act
  const conversation = await startOrchestration(ctx.app);

  // Assert
  const parked = await waitForOrchestration(
    ctx.app,
    conversation.orchestrationId,
    ({ status }) => status === "awaiting_user",
  );
  expect(parked.decisionError).toBe(NOTHING_TO_MERGE);
  ctx.engine.verify();
});

const SEARCH = "export const search = 1;";

const BUILT = "Built search.\n\nVERDICT: PASS";

const VERIFIED = "Search works.\n\nVERDICT: PASS";

const INITIATIVE_BRANCH = /isotopy\/[0-9a-f]{8}/;

const LEFTOVER_BRANCH = "isotopy/0ld0ld00";

const ORCHESTRATOR_SESSION = "orchestrator-session";

const ASK: OrchestratorDecision = { action: "ask_user", question: "Which database?" };

const NOTHING_TO_DO: OrchestratorDecision = {
  action: "stop",
  reason: "Search already exists",
};

const FIX_RUN: OrchestratorDecision = {
  action: "start_run",
  rationale: "Search returns nothing for the seeded rows",
  flow: "pair",
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

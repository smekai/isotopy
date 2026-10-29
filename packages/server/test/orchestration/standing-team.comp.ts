// TASK-208: a project has one team, in `.isotopy/team.md`. The Orchestrator runs
// its flows without asking, and changes it only through a proposal the owner
// approves once. These run against real temporary repositories, because what
// matters is what git ends up holding on the base branch.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, expect, test } from "vitest";
import type { OrchestratorDecision, ProjectTeam, RunState } from "@isotopy/core";
import { commitFile, commitStagedFile, fileAt, initGitRepository } from "../support/git-project.ts";
import {
  addTestProject,
  createTestApp,
  get,
  post,
  startOrchestration,
  teamRunOf,
  waitForOrchestration,
  waitForRunStatus,
} from "../support/harness.ts";
import type { TestApp, TestHeaders } from "../support/harness.ts";
import {
  PAIR_TEAM,
  START_PAIR,
  TEAM_CHANGE,
  VERIFYING_TEAM,
  fenced,
  teamFileText,
  writeTeam,
  writeTeamText,
} from "../support/orchestration-fixtures.ts";

test("a project without team.md gets the bundled template, committed on the branch it is on", async () => {
  // Arrange
  const project = await gitProject("seeds");

  // Anticipate — the Orchestrator reads the template's flows on its first turn.
  ctx.engine.anticipate({ as: "Orchestrator", prompt: /delivery:[\s\S]*discovery:/ }).reports(fenced(STOP));

  // Act
  const conversation = await startOrchestration(ctx.app, project.headers);

  // Assert
  await waitForRunStatus(ctx.app, conversation.id, "completed");
  expect(await fileAt(project.root, "main", TEAM_PATH)).toBe((await readFile(BUNDLED_TEAM, "utf8")).trim());
  ctx.engine.verify();
});

test("an approved team change is written and committed on the base, not only on the initiative's branch", async () => {
  // Arrange
  const project = await gitProjectWithPairTeam("changes");
  const conversation = await initiativeAwaitingTeamChange(project.headers);

  // Anticipate — the Orchestrator is told the change holds, and stops.
  ctx.engine
    .anticipate({ as: "Orchestrator after approval", prompt: /verify:[\s\S]*owner approved it/ })
    .reports(fenced(STOP));

  // Act
  const { status, body: next } = await post<RunState>(
    ctx.app,
    `/orchestrations/${conversation.orchestrationId}/approve`,
    { engine: "claude-code" },
    project.headers,
  );

  // Assert
  expect(status, JSON.stringify(next)).toBe(201);
  await waitForRunStatus(ctx.app, next.id, "completed");
  const changed = teamFileText(VERIFYING_TEAM).trim();
  expect(await fileAt(project.root, "main", TEAM_PATH)).toBe(changed);
  expect(await fileAt(project.root, `isotopy/${conversation.orchestrationId}`, TEAM_PATH)).toBe(changed);
  ctx.engine.verify();
});

test("the next initiative runs on the team the owner approved, even when the last one was never merged", async () => {
  // Arrange — approve the change, then stop without merging the initiative's branch.
  const project = await gitProjectWithPairTeam("next");
  const first = await initiativeAwaitingTeamChange(project.headers);
  ctx.engine.anticipate({ as: "Orchestrator after approval" }).reports(fenced(STOP));
  const { body: closing } = await post<RunState>(
    ctx.app,
    `/orchestrations/${first.orchestrationId}/approve`,
    { engine: "claude-code" },
    project.headers,
  );
  await waitForRunStatus(ctx.app, closing.id, "completed");

  // Anticipate — the new initiative starts on the base and sees the new flow.
  ctx.engine.anticipate({ as: "next Orchestrator", prompt: /verify:/ }).reports(fenced(STOP));

  // Act
  const next = await startOrchestration(ctx.app, project.headers);

  // Assert
  await waitForRunStatus(ctx.app, next.id, "completed");
  ctx.engine.verify();
});

test("a team change that does not validate is refused before the owner is ever asked", async () => {
  // Arrange
  await writeTeam(ctx.home);

  // Anticipate — the proposed roster names an agent nobody has.
  ctx.engine.anticipate({ as: "Orchestrator" }).reports(fenced(INVALID_CHANGE));

  // Act
  const conversation = await startOrchestration(ctx.app);

  // Assert
  const parked = await waitForOrchestration(
    ctx.app,
    conversation.orchestrationId,
    ({ decisionError }) => decisionError !== undefined,
  );
  expect(parked.decisionError).toContain("Unknown agent: wizard");
  expect(parked.status).toBe("awaiting_user");
  ctx.engine.verify();
});

test("an invalid team.md refuses every team run with its issues, rather than falling back to a default", async () => {
  // Arrange
  await writeTeamText(ctx.home, "---\nroster: []\nflows: {}\n---\n");

  // Anticipate — the Orchestrator is told the file is broken, and starts a run anyway.
  ctx.engine.anticipate({ as: "Orchestrator", prompt: /team\.md is not valid/ }).reports(fenced(START_PAIR));

  // Act
  const conversation = await startOrchestration(ctx.app);

  // Assert
  const parked = await waitForOrchestration(
    ctx.app,
    conversation.orchestrationId,
    ({ decisionError }) => decisionError !== undefined,
  );
  expect(parked.decisionError).toContain("team.md.roster");
  expect(parked.runIds).toEqual([conversation.id]);
  ctx.engine.verify();
});

test("the team a project would run on is readable before anything has seeded it", async () => {
  // Anticipate — none: reading the team never reaches an engine.

  // Act
  const { body: team } = await get<ProjectTeam>(ctx.app, "/team");

  // Assert
  expect(team).toMatchObject({ state: "valid", source: "template" });
  ctx.engine.verify();
});

const TEAM_PATH = ".isotopy/team.md";

const BUNDLED_TEAM = fileURLToPath(new URL("../../src/domain/skills/team/team.md", import.meta.url));

const STOP: OrchestratorDecision = { action: "stop", reason: "Nothing more to do" };

const INVALID_CHANGE: OrchestratorDecision = {
  action: "propose_team_change",
  rationale: "A wizard would help",
  team: teamFileText({ ...PAIR_TEAM, roster: [{ id: "implementation", label: "Conjuring", agent: "wizard" }] }),
};

let ctx: TestApp;

beforeEach(async () => {
  ctx = await createTestApp();
});

afterEach(async () => {
  await ctx.dispose();
});

async function gitProject(name: string) {
  const project = await addTestProject(ctx.registry, name);
  await initGitRepository(project.root);
  await commitFile(project.root, "README.md", "# app\n", "Start the app");
  return project;
}

async function gitProjectWithPairTeam(name: string) {
  const project = await gitProject(name);
  await commitStagedFile(project.root, TEAM_PATH, teamFileText(PAIR_TEAM), "The pair team");
  return project;
}

async function initiativeAwaitingTeamChange(headers: TestHeaders): Promise<RunState> {
  ctx.engine.anticipate({ as: "Orchestrator" }).reports(fenced(START_PAIR));
  ctx.engine.anticipate({ as: "Developer" }).reports("Built it.\n\nVERDICT: PASS");
  ctx.engine.anticipate({ as: "QA Engineer" }).reports("Checked it.\n\nVERDICT: PASS");
  ctx.engine.anticipateRunReview({ as: "review proposing a team change", decision: TEAM_CHANGE });
  const conversation = await startOrchestration(ctx.app, headers);
  const delivery = await teamRunOf(ctx.app, conversation, headers);
  await waitForRunStatus(ctx.app, delivery.id, "completed");
  await waitForOrchestration(ctx.app, conversation.orchestrationId, ({ status }) => status === "awaiting_approval", headers);
  return conversation;
}

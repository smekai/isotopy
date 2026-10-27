// TASK-209: an isolated reviewer judges the change from the task, the plan and
// the diff — never from the Developer's own account of what it did — unless the
// Orchestrator grants the handoffs for one run.
import { afterEach, beforeEach, expect, test } from "vitest";
import type { OrchestratorDecision, PipelineDefinition, RunState } from "@isotopy/core";
import { commitFile, initGitRepository } from "../support/git-project.ts";
import {
  addTestProject,
  createTestApp,
  post,
  proposedTeam,
  stageOf,
  waitForRunStatus,
} from "../support/harness.ts";
import type { TestApp } from "../support/harness.ts";
import { fenced } from "../support/orchestration-fixtures.ts";

const TASK = "add a share button";
const PLAN_REPORT = "Plan: a share button on the trip page. MARKER-PLAN";
const DEV_REPORT = "Added the share button and why it is fine. MARKER-DEVELOPER";
const REVIEW_PASS = "The diff matches the plan.\n\nVERDICT: PASS";
const QA_PASS = "Checked the share button.\n\nVERDICT: PASS";
const GRANT_RATIONALE = "the previous review failed on a migration the Developer has since explained";

const REVIEW_TEAM_PROPOSAL: OrchestratorDecision = {
  action: "propose_team",
  rationale: "Plan, build and review independently",
  team: {
    name: "Reviewed delivery",
    summary: "Plan, build and review the share button",
    roles: [
      { id: "plan", label: "Product Manager", skill: "project-manager", stepTask: "plan-feature" },
      { id: "implementation", label: "Developer", skill: "developer", stepTask: "implement-feature" },
      { id: "review", label: "Reviewer", skill: "software-architect", stepTask: "review-implementation" },
    ],
  },
};

const REVIEWED_TEAM: PipelineDefinition = {
  id: "reviewed-team",
  name: "Reviewed team",
  description: "Plan, build, review in isolation, then verify.",
  groups: [
    {
      stages: [
        { id: "plan", label: "Planning", skill: "project-manager", stepTask: "plan-feature" },
        { id: "implementation", label: "Implementing", skill: "developer", stepTask: "implement-feature" },
        {
          id: "review",
          label: "Reviewing",
          skill: "software-architect",
          stepTask: "review-implementation",
          context: "isolated",
        },
        { id: "test", label: "Verifying", skill: "tester", stepTask: "verify-feature" },
      ],
    },
  ],
};

let ctx: TestApp;

beforeEach(async () => {
  ctx = await createTestApp();
});

afterEach(async () => {
  await ctx.dispose();
});

test("a composed team's reviewer sees the plan and the branch to diff, not the Developer's handoff", async () => {
  // Arrange
  const project = await addTestProject(ctx.registry, "isolated");
  await initGitRepository(project.root);
  await commitFile(project.root, "README.md", "# app\n", "Start the app");

  // Anticipate — the reviewer is the fourth call; it hangs so the prompt can be read.
  ctx.engine.anticipate({ as: "Orchestrator" }).reports(fenced(REVIEW_TEAM_PROPOSAL));
  ctx.engine.anticipate({ as: "Product Manager" }).reports(PLAN_REPORT);
  ctx.engine.anticipate({ as: "Developer", prompt: /MARKER-PLAN/ }).reports(DEV_REPORT);
  ctx.engine.anticipate({ as: "Reviewer", prompt: /MARKER-PLAN/ }).hangsUntilAborted();
  const conversation = await proposedTeam(ctx.app, project.headers);

  // Act
  const { body: run } = await post<RunState>(
    ctx.app,
    `/orchestrations/${conversation.orchestrationId}/approve`,
    { engine: "claude-code" },
    project.headers,
  );

  // Assert
  const reviewer = await ctx.engine.waitForCall(4);
  expect(reviewer.prompt).not.toContain("MARKER-DEVELOPER");
  expect(reviewer.prompt).toContain(`git diff main...isotopy/${conversation.orchestrationId}`);
  expect(run.branch?.base).toBe("main");
  ctx.engine.verify();
});

test("stages after an isolated review still receive every earlier handoff", async () => {
  // Anticipate — QA comes after the isolated reviewer and is not isolated itself.
  ctx.engine.anticipate({ as: "Product Manager" }).reports(PLAN_REPORT);
  ctx.engine.anticipate({ as: "Developer" }).reports(DEV_REPORT);
  ctx.engine.anticipate({ as: "Reviewer" }).reports(REVIEW_PASS);
  ctx.engine.anticipate({ as: "QA Engineer", prompt: /MARKER-DEVELOPER/ }).reports(QA_PASS);
  ctx.engine.anticipateRunReview();

  // Act
  const run = await ctx.orchestrator.startComposedRun(ctx.registry.resolve(), REVIEWED_TEAM, {
    task: TASK,
  });

  // Assert
  await waitForRunStatus(ctx.app, run.id, "completed");
  ctx.engine.verify();
  expect(ctx.engine.callAt(2).prompt).not.toContain("MARKER-DEVELOPER");
});

test("a run the Orchestrator grants the handoffs gives its reviewer the Developer's handoff and logs why", async () => {
  // Anticipate — the granted reviewer reads what the Developer wrote.
  ctx.engine.anticipate({ as: "Product Manager" }).reports(PLAN_REPORT);
  ctx.engine.anticipate({ as: "Developer" }).reports(DEV_REPORT);
  ctx.engine.anticipate({ as: "Reviewer", prompt: /MARKER-DEVELOPER/ }).reports(REVIEW_PASS);
  ctx.engine.anticipate({ as: "QA Engineer" }).reports(QA_PASS);
  ctx.engine.anticipateRunReview();

  // Act
  const run = await ctx.orchestrator.startComposedRun(ctx.registry.resolve(), REVIEWED_TEAM, {
    task: TASK,
    reviewContextGrant: { context: "handoffs", rationale: GRANT_RATIONALE },
  });

  // Assert
  const finished = await waitForRunStatus(ctx.app, run.id, "completed");
  expect(stageOf(finished, "review").logs.map((entry) => entry.message).join("\n")).toContain(GRANT_RATIONALE);
  ctx.engine.verify();
});

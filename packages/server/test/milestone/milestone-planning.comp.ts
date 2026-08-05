import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import type { Milestone, RunState } from "@adhd/core";
import {
  createTestApp,
  get,
  post,
  waitForRunStatus,
  waitForStageStatus,
} from "../support/harness.ts";
import type { TestApp } from "../support/harness.ts";

const PLAN = {
  name: "Milestone D",
  goal: "Ship conversational planning",
  features: [
    {
      id: "planner",
      title: "Milestone planner",
      description: "Plan and approve milestone work",
      acceptanceCriteria: ["Approval creates the missing task"],
      existingTaskIds: [],
      taskDrafts: [
        {
          id: "planner-api",
          title: "Build milestone planner",
          description: "Implement the approved milestone planning flow.",
          priority: "P0",
          tags: ["server", "ui"],
        },
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

test("answering the Product Manager's question yields a saved draft proposal", async () => {
  // Anticipate
  anticipatePlanningConversation();

  // Act
  const { run, draft } = await planUntilDraft();

  // Assert
  expect(draft).toMatchObject({
    name: "Milestone D",
    status: "draft",
    planningRunIds: [run.id],
    proposal: { revision: 1, features: [{ id: "planner" }] },
  });
  ctx.engine.verify();
});

test("approving a draft mints the task its feature only proposed", async () => {
  // Anticipate
  anticipatePlanningConversation();

  // Arrange
  const { draft } = await planUntilDraft();

  // Act
  const approved = await post<Milestone>(ctx.app, `/milestones/${draft.id}/approve`);

  // Assert
  expect(approved.status).toBe(200);
  expect(approved.body).toMatchObject({
    status: "active",
    features: [
      {
        id: "planner",
        status: "ready",
        taskIds: ["TASK-001"],
      },
    ],
  });
  const backlog = await readFile(path.join(ctx.home, "tasks", "BACKLOG.md"), "utf8");
  expect(backlog).toContain("## TASK-001: Build milestone planner");
  expect(backlog).toContain("ADHD-MILESTONE-TASK:");
  ctx.engine.verify();
});

test("invalid existing task links leave the proposal as a retryable draft", async () => {
  // Arrange
  const invalidLinkPlan = {
    ...PLAN,
    features: [
      {
        ...PLAN.features[0],
        existingTaskIds: ["TASK-404"],
        taskDrafts: [],
      },
    ],
  };

  // Anticipate — a plan that reuses a task the board never had.
  ctx.engine
    .anticipate({ as: "Product Manager" })
    .reports(
      `\`\`\`adhd-milestone-plan\n${JSON.stringify(invalidLinkPlan)}\n\`\`\``,
    );
  ctx.engine.anticipateRunReview();
  const { body: run } = await post<RunState>(ctx.app, "/milestones/plan", {
    goal: "Reuse a missing task",
  });
  await waitForRunStatus(ctx.app, run.id, "completed");

  // Act
  const approval = await post<{ error: string }>(
    ctx.app,
    `/milestones/${run.milestoneId}/approve`,
  );

  // Assert — the draft survives so the user can fix the plan and retry.
  const { body: draft } = await get<Milestone>(
    ctx.app,
    `/milestones/${run.milestoneId}`,
  );
  expect(approval.status).toBe(400);
  expect(approval.body.error).toContain("TASK-404");
  expect(draft.status).toBe("draft");
  expect(draft.approvalError).toContain("TASK-404");
  ctx.engine.verify();
});

/** The Product Manager asks one question, then proposes PLAN on the answer. */
function anticipatePlanningConversation(): void {
  ctx.engine
    .anticipate({
      as: "Product Manager question",
      persona: /# Role: Product Manager/,
      prompt: /task board/i,
    })
    .asks("Should this include the UI?", "planning-session");
  ctx.engine
    .anticipate({
      as: "Orchestrator escalation",
      persona: /# Role: Orchestrator/,
      prompt: /Should this include the UI/,
    })
    .parks(
      fenced({
        action: "escalate_to_user",
        question: "Should this milestone include UI work?",
        originStageId: "milestone-plan",
      }),
      "planning-broker-session",
    );
  ctx.engine
    .anticipate({
      as: "Orchestrator routing",
      resumeSessionId: "planning-broker-session",
      prompt: /Yes, include the UI/,
    })
    .reports(
      fenced({
        action: "route_to_agent",
        stageId: "milestone-plan",
        message: "Yes, include the UI.",
        rationale: "The user confirmed the scope",
      }),
    );
  ctx.engine
    .anticipate({
      as: "Product Manager proposal",
      resumeSessionId: "planning-session",
      prompt: /Yes, include the UI/,
    })
    .reports(
      `Recommended plan\n\n\`\`\`adhd-milestone-plan\n${JSON.stringify(PLAN)}\n\`\`\``,
    );
  ctx.engine.anticipateRunReview();
}

function fenced(decision: unknown): string {
  return `\`\`\`adhd-orchestrator-decision\n${JSON.stringify(decision)}\n\`\`\``;
}

/** Drive the anticipated conversation through its parked question to a draft. */
async function planUntilDraft(): Promise<{ run: RunState; draft: Milestone }> {
  const { status, body: run } = await post<RunState>(
    ctx.app,
    "/milestones/plan",
    { goal: "Plan milestone D", engine: "claude-code" },
  );
  expect(status, "starting a planning run").toBe(201);
  await waitForStageStatus(ctx.app, run.id, "milestone-plan", "asking");
  await post(ctx.app, `/runs/${run.id}/messages`, { text: "Yes, include the UI" });
  await waitForRunStatus(ctx.app, run.id, "completed");

  const { body: draft } = await get<Milestone>(ctx.app, `/milestones/${run.milestoneId}`);
  return { run, draft };
}

// A project that brings its own agent and step gets them on a team the same way it
// gets a bundled one: the Orchestrator is told they exist, an approved team naming
// them composes, and the stage runs with the project's text.
import { afterEach, beforeEach, expect, test } from "vitest";
import type { OrchestratorDecision, RunState } from "@isotopy/core";
import { writeProjectAgent, writeProjectStep } from "../support/agent-files.ts";
import { createTestApp, post, stageOf, waitForRunStatus } from "../support/harness.ts";
import type { TestApp } from "../support/harness.ts";

const PLANNER = {
  id: "campaign",
  label: "Planning a campaign",
  skill: "growth-marketer",
  stepTask: "plan-campaign",
};

const PROPOSE_PLANNER: OrchestratorDecision = {
  action: "propose_team",
  rationale: "One marketer can plan the launch",
  team: { name: "Launch crew", summary: "Plan the launch campaign", roles: [PLANNER] },
};

let ctx: TestApp;

beforeEach(async () => {
  ctx = await createTestApp();
  await writeProjectAgent(ctx.home);
  await writeProjectStep(ctx.home);
});

afterEach(async () => {
  await ctx.dispose();
});

test("the Orchestrator is told about an agent and a step the project brings", async () => {
  // Anticipate — both appear in the catalogs the Orchestrator chooses from.
  ctx.engine
    .anticipate({
      as: "Orchestrator",
      prompt: /`growth-marketer` — Growth Marketer — Finds the people[\s\S]*`plan-campaign` — Plan one campaign/,
    })
    .reports(fenced(PROPOSE_PLANNER));

  // Act
  const { body: conversation } = await post<RunState>(ctx.app, "/orchestrations", GOAL);

  // Assert
  await waitForRunStatus(ctx.app, conversation.id, "completed");
  ctx.engine.verify();
});

test("an approved team naming the project's agent runs it with the project's persona and assignment", async () => {
  // Arrange
  ctx.engine.anticipate({ as: "Orchestrator" }).reports(fenced(PROPOSE_PLANNER));
  const { body: conversation } = await post<RunState>(ctx.app, "/orchestrations", GOAL);
  await waitForRunStatus(ctx.app, conversation.id, "completed");

  // Anticipate
  ctx.engine
    .anticipate({
      as: "Growth Marketer",
      persona: /^# Role: Growth Marketer/,
      prompt: /^## Step task\n\n# Assignment: Plan a campaign/,
    })
    .reports("Plan: one audience, one channel.\n\nVERDICT: PASS");
  ctx.engine.anticipateRunReview();

  // Act
  const { body: composed } = await post<RunState>(
    ctx.app,
    `/orchestrations/${conversation.orchestrationId}/approve`,
    { engine: "claude-code" },
  );

  // Assert
  await waitForRunStatus(ctx.app, composed.id, "completed");
  ctx.engine.verify();
});

test("a run records the title and glyph the project's catalog gives its stage", async () => {
  // Arrange
  ctx.engine.anticipate({ as: "Orchestrator" }).reports(fenced(PROPOSE_PLANNER));
  const { body: conversation } = await post<RunState>(ctx.app, "/orchestrations", GOAL);
  await waitForRunStatus(ctx.app, conversation.id, "completed");

  // Anticipate
  ctx.engine.anticipate({ as: "Growth Marketer" }).reports("Plan drafted.\n\nVERDICT: PASS");
  ctx.engine.anticipateRunReview();

  // Act
  const { body: composed } = await post<RunState>(
    ctx.app,
    `/orchestrations/${conversation.orchestrationId}/approve`,
    { engine: "claude-code" },
  );

  // Assert
  expect(composed.stages[0]).toMatchObject({ title: "Growth Marketer", glyph: "✶" });
  await waitForRunStatus(ctx.app, composed.id, "completed");
});

test("the run log names a project agent by the title its file gives", async () => {
  // Arrange
  ctx.engine.anticipate({ as: "Orchestrator" }).reports(fenced(PROPOSE_PLANNER));
  const { body: conversation } = await post<RunState>(ctx.app, "/orchestrations", GOAL);
  await waitForRunStatus(ctx.app, conversation.id, "completed");

  // Anticipate
  ctx.engine.anticipate({ as: "Growth Marketer" }).reports("Plan drafted.\n\nVERDICT: PASS");
  ctx.engine.anticipateRunReview();

  // Act
  const { body: composed } = await post<RunState>(
    ctx.app,
    `/orchestrations/${conversation.orchestrationId}/approve`,
    { engine: "claude-code" },
  );

  // Assert
  const finished = await waitForRunStatus(ctx.app, composed.id, "completed");
  expect(stageOf(finished, "campaign").logs.map((entry) => entry.message)).toContainEqual(
    expect.stringMatching(/^Growth Marketer online/),
  );
});

const GOAL = { goal: "Get the first hundred travellers", engine: "claude-code" };

function fenced(decision: unknown): string {
  return `\`\`\`isotopy-orchestrator-decision\n${JSON.stringify(decision)}\n\`\`\``;
}

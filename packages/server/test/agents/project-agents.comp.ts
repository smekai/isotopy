// A project that brings its own agent and step gets them on its team the same way it
// gets a bundled one: the Orchestrator is told they exist, a flow naming them
// composes, and the stage runs with the project's text.
import { afterEach, beforeEach, expect, test } from "vitest";
import type { OrchestratorDecision, RunState, TeamDefinition } from "@isotopy/core";
import { writeProjectAgent, writeProjectStep } from "../support/agent-files.ts";
import {
  createTestApp,
  post,
  stageOf,
  teamRunOf,
  waitForRunStatus,
} from "../support/harness.ts";
import type { TestApp } from "../support/harness.ts";
import { writeTeam } from "../support/orchestration-fixtures.ts";

const LAUNCH_TEAM: TeamDefinition = {
  roster: [{ id: "campaign", label: "Planning a campaign", agent: "growth-marketer" }],
  flows: { launch: [{ role: "campaign", step: "plan-campaign" }] },
};

const START_LAUNCH: OrchestratorDecision = {
  action: "start_run",
  rationale: "One marketer can plan the launch",
  flow: "launch",
  task: "Plan the launch campaign",
};

let ctx: TestApp;

beforeEach(async () => {
  ctx = await createTestApp();
  await writeProjectAgent(ctx.home);
  await writeProjectStep(ctx.home);
  await writeTeam(ctx.home, LAUNCH_TEAM);
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
    .reports(fenced({ action: "stop", reason: "The board already covers it" }));

  // Act
  const { body: conversation } = await post<RunState>(ctx.app, "/orchestrations", GOAL);

  // Assert
  await waitForRunStatus(ctx.app, conversation.id, "completed");
  ctx.engine.verify();
});

test("a flow naming the project's agent runs it with the project's persona and assignment", async () => {
  // Anticipate
  ctx.engine.anticipate({ as: "Orchestrator" }).reports(fenced(START_LAUNCH));
  ctx.engine
    .anticipate({
      as: "Growth Marketer",
      persona: /^# Role: Growth Marketer/,
      prompt: /^## Step task\n\n# Assignment: Plan a campaign/,
    })
    .reports("Plan: one audience, one channel.\n\nVERDICT: PASS");
  ctx.engine.anticipateRunReview();

  // Act
  const { body: conversation } = await post<RunState>(ctx.app, "/orchestrations", GOAL);

  // Assert
  const composed = await teamRunOf(ctx.app, conversation);
  await waitForRunStatus(ctx.app, composed.id, "completed");
  ctx.engine.verify();
});

test("a run records the title and glyph the project's catalog gives its stage", async () => {
  // Anticipate
  ctx.engine.anticipate({ as: "Orchestrator" }).reports(fenced(START_LAUNCH));
  ctx.engine.anticipate({ as: "Growth Marketer" }).reports("Plan drafted.\n\nVERDICT: PASS");
  ctx.engine.anticipateRunReview();

  // Act
  const { body: conversation } = await post<RunState>(ctx.app, "/orchestrations", GOAL);

  // Assert
  const composed = await teamRunOf(ctx.app, conversation);
  expect(composed.stages[0]).toMatchObject({ title: "Growth Marketer", glyph: "✶" });
  await waitForRunStatus(ctx.app, composed.id, "completed");
});

test("the run log names a project agent by the title its file gives", async () => {
  // Anticipate
  ctx.engine.anticipate({ as: "Orchestrator" }).reports(fenced(START_LAUNCH));
  ctx.engine.anticipate({ as: "Growth Marketer" }).reports("Plan drafted.\n\nVERDICT: PASS");
  ctx.engine.anticipateRunReview();

  // Act
  const { body: conversation } = await post<RunState>(ctx.app, "/orchestrations", GOAL);

  // Assert
  const composed = await teamRunOf(ctx.app, conversation);
  const finished = await waitForRunStatus(ctx.app, composed.id, "completed");
  expect(stageOf(finished, "campaign").logs.map((entry) => entry.message)).toContainEqual(
    expect.stringMatching(/^Growth Marketer online/),
  );
});

const GOAL = { goal: "Get the first hundred travellers", engine: "claude-code" };

function fenced(decision: unknown): string {
  return `\`\`\`isotopy-orchestrator-decision\n${JSON.stringify(decision)}\n\`\`\``;
}

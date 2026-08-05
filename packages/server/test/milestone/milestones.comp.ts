import { afterEach, assert, beforeEach, expect, test } from "vitest";
import type { Milestone, RunState } from "@adhd/core";
import {
  createTestApp,
  get,
  patch,
  post,
  restartApp,
  waitForStageStatus,
} from "../support/harness.ts";
import type { TestApp } from "../support/harness.ts";

let ctx: TestApp;

beforeEach(async () => {
  ctx = await createTestApp();
});

afterEach(async () => {
  await ctx.dispose();
});

test("a created feature keeps the metadata it was given and starts ready", async () => {
  // Act
  const created = await milestoneWithOneFeature();

  // Assert
  expect(created.features[0]).toMatchObject({
    title: "Persistence",
    acceptanceCriteria: ["Survives restart"],
    taskIds: ["TASK-088"],
    status: "ready",
  });
});

test("a milestone and its feature metadata survive a server restart", async () => {
  // Arrange
  const created = await milestoneWithOneFeature();
  await ctx.orchestrator.shutdown();

  // Act
  const restarted = await restartApp();

  // Assert
  const { body: loaded } = await get<Milestone>(restarted.app, `/milestones/${created.id}`);
  expect(loaded).toEqual(created);
  await restarted.shutdown();
});

test("accepting a needs-attention feature completes it with an audit stamp", async () => {
  // Arrange
  const { milestone, featureId } = await acceptedFeature();

  // Act
  const { status, body: accepted } = await post<Milestone>(
    ctx.app,
    `/milestones/${milestone.id}/features/${featureId}/accept`,
  );

  // Assert
  expect(status).toBe(200);
  expect(accepted.features[0]?.status).toBe("completed");
  expect(accepted.features[0]?.acceptedAt).toBeTypeOf("string");
});

test("a feature already accepted cannot be accepted a second time", async () => {
  // Arrange
  const { milestone, featureId } = await acceptedFeature();
  const route = `/milestones/${milestone.id}/features/${featureId}/accept`;
  await post(ctx.app, route);

  // Act
  const repeated = await post<{ error: string }>(ctx.app, route);

  // Assert
  expect(repeated.status).toBe(400);
  expect(repeated.body.error).toContain("needing attention");
});

test("the acceptance stamp survives a server restart", async () => {
  // Arrange
  const { milestone, featureId } = await acceptedFeature();
  const { body: accepted } = await post<Milestone>(
    ctx.app,
    `/milestones/${milestone.id}/features/${featureId}/accept`,
  );
  await ctx.orchestrator.shutdown();

  // Act
  const restarted = await restartApp();

  // Assert
  const { body: loaded } = await get<Milestone>(restarted.app, `/milestones/${milestone.id}`);
  expect(loaded.features[0]?.acceptedAt).toBe(accepted.features[0]?.acceptedAt);
  await restarted.shutdown();
});

test("starting the next feature links one Full Delivery run", async () => {
  // Arrange
  const { body: milestone } = await post<Milestone>(ctx.app, "/milestones", {
    name: "Delivery",
    features: [{ title: "First feature", taskIds: ["TASK-088"] }],
  });

  // Anticipate
  ctx.engine.anticipate({ as: "Product Manager" }).reports("Ready to build");

  // Act
  const { status, body: run } = await post<RunState>(
    ctx.app,
    `/milestones/${milestone.id}/start-next`,
    { engine: "claude-code" },
  );

  // Assert — the feature's tasks become the run's scope, and the link is two-way.
  expect(status).toBe(201);
  expect(run).toMatchObject({
    milestoneId: milestone.id,
    featureId: milestone.features[0]?.id,
    sourceTaskIds: ["TASK-088"],
    pipelineId: "full-delivery",
  });
  await waitForStageStatus(ctx.app, run.id, "intake", "awaiting");
  const { body: linked } = await get<Milestone>(ctx.app, `/milestones/${milestone.id}`);
  expect(linked.features[0]).toMatchObject({
    status: "in_progress",
    runIds: [run.id],
  });
  ctx.orchestrator.abortRun(run.id);
  ctx.engine.verify();
});

test("a feature already in progress cannot be started a second time", async () => {
  // Arrange
  const { body: milestone } = await post<Milestone>(ctx.app, "/milestones", {
    name: "Delivery",
    features: [{ title: "First feature", taskIds: ["TASK-088"] }],
  });

  // Anticipate — one run only; a second would be paid work on the same feature.
  ctx.engine.anticipate({ as: "Product Manager" }).reports("Ready to build");
  const { body: run } = await post<RunState>(
    ctx.app,
    `/milestones/${milestone.id}/start-next`,
    { engine: "claude-code" },
  );
  await waitForStageStatus(ctx.app, run.id, "intake", "awaiting");

  // Act
  const duplicate = await post<{ error: string }>(
    ctx.app,
    `/milestones/${milestone.id}/start-next`,
    {},
  );

  // Assert
  expect(duplicate.status).toBe(400);
  expect(duplicate.body.error).toContain("in progress");
  ctx.orchestrator.abortRun(run.id);
  ctx.engine.verify();
});

const DRAFT_PLAN = {
  name: "Milestone E",
  goal: "Ship the editor",
  features: [
    {
      id: "editor",
      title: "Proposal editor",
      description: "Edit a draft proposal before approving it",
      acceptanceCriteria: ["The proposal is editable"],
      existingTaskIds: [],
      taskDrafts: [
        {
          id: "editor-api",
          title: "Add the editor endpoint",
          description: "Accept an edited proposal.",
          priority: "P1",
          tags: ["server"],
        },
      ],
    },
  ],
};


test("editing a draft proposal stamps a new revision", async () => {
  // Arrange
  const milestone = await draftMilestone();

  // Act
  const { status, body } = await patch<Milestone>(
    ctx.app,
    `/milestones/${milestone.id}/proposal`,
    DRAFT_PLAN,
  );

  // Assert
  expect(status).toBe(200);
  expect(body.proposal).toMatchObject({ revision: 1, name: "Milestone E" });
  expect(body.name).toBe("Milestone E");
});

test("a proposal with duplicate feature ids is refused with a path-aware issue", async () => {
  // Arrange
  const milestone = await draftMilestone();

  // Act
  const { status, body } = await patch<{
    error: string;
    issues: { path: (string | number)[]; message: string }[];
  }>(ctx.app, `/milestones/${milestone.id}/proposal`, {
    ...DRAFT_PLAN,
    features: [DRAFT_PLAN.features[0], DRAFT_PLAN.features[0]],
  });

  // Assert
  expect(status).toBe(400);
  expect(body.error).toBe("Invalid request");
  expect(body.issues[0]?.path).toEqual(["features"]);
  expect(body.issues[0]?.message).toContain("unique");
});

test("a proposal whose feature has no acceptance criteria is refused", async () => {
  // Arrange
  const milestone = await draftMilestone();

  // Act
  const { status, body } = await patch<{
    issues: { path: (string | number)[] }[];
  }>(ctx.app, `/milestones/${milestone.id}/proposal`, {
    ...DRAFT_PLAN,
    features: [{ ...DRAFT_PLAN.features[0], acceptanceCriteria: [] }],
  });

  // Assert
  expect(status).toBe(400);
  expect(body.issues[0]?.path).toEqual(["features", 0, "acceptanceCriteria"]);
});

/** A milestone with one fully specified feature, created through the API. */
async function milestoneWithOneFeature(feature: object = {}): Promise<Milestone> {
  const { status, body } = await post<Milestone>(ctx.app, "/milestones", {
    name: "Milestone D",
    goal: "Ship milestone planning",
    autoRunNext: true,
    features: [
      {
        title: "Persistence",
        acceptanceCriteria: ["Survives restart"],
        taskIds: ["TASK-088"],
        ...feature,
      },
    ],
  });
  expect(status, "creating a milestone").toBe(201);
  return body;
}

async function acceptedFeature(): Promise<{ milestone: Milestone; featureId: string }> {
  const { body: created } = await post<Milestone>(ctx.app, "/milestones", {
    name: "Delivery",
    features: [{ title: "Reviewed feature" }],
  });
  const featureId = created.features[0]?.id;
  assert(featureId, `milestone ${created.id} was created with no features`);
  await patch(ctx.app, `/milestones/${created.id}/features/${featureId}`, {
    status: "needs_attention",
  });
  return { milestone: created, featureId };
}

async function draftMilestone(): Promise<Milestone> {
  const { body } = await post<Milestone>(ctx.app, "/milestones", {
    name: "Milestone E",
    goal: "Ship the editor",
    status: "draft",
  });
  return body;
}

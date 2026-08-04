import { afterEach, beforeEach, expect, test } from "vitest";
import type { Milestone, RunState } from "@adhd/core";
import {
  createTestApp,
  get,
  patch,
  post,
  restartApp,
  waitForStageStatus,
} from "./support/harness.ts";
import type { TestApp } from "./support/harness.ts";

let ctx: TestApp;

beforeEach(async () => {
  ctx = await createTestApp();
});

afterEach(async () => {
  await ctx.dispose();
});

test("a milestone and its feature metadata survive a server restart", async () => {
  const { status, body: created } = await post<Milestone>(
    ctx.app,
    "/milestones",
    {
      name: "Milestone D",
      goal: "Ship milestone planning",
      autoRunNext: true,
      features: [
        {
          title: "Persistence",
          acceptanceCriteria: ["Survives restart"],
          taskIds: ["TASK-088"],
        },
      ],
    },
  );

  expect(status).toBe(201);
  expect(created.features[0]).toMatchObject({
    title: "Persistence",
    acceptanceCriteria: ["Survives restart"],
    taskIds: ["TASK-088"],
    status: "ready",
  });

  await ctx.orchestrator.shutdown();
  const restarted = await restartApp();
  const { body: loaded } = await get<Milestone>(
    restarted.app,
    `/milestones/${created.id}`,
  );

  expect(loaded).toEqual(created);
  await restarted.orchestrator.shutdown();
});

test("accepting a needs-attention feature completes it with an audit stamp that survives restart", async () => {
  const { body: created } = await post<Milestone>(ctx.app, "/milestones", {
    name: "Delivery",
    features: [{ title: "Reviewed feature" }],
  });
  const featureId = created.features[0]?.id ?? "";
  await patch(ctx.app, `/milestones/${created.id}/features/${featureId}`, {
    status: "needs_attention",
  });

  const { status, body: accepted } = await post<Milestone>(
    ctx.app,
    `/milestones/${created.id}/features/${featureId}/accept`,
  );

  expect(status).toBe(200);
  expect(accepted.features[0]?.status).toBe("completed");
  expect(accepted.features[0]?.acceptedAt).toBeTypeOf("string");

  const repeated = await post<{ error: string }>(
    ctx.app,
    `/milestones/${created.id}/features/${featureId}/accept`,
  );
  expect(repeated.status).toBe(400);
  expect(repeated.body.error).toContain("needing attention");

  await ctx.orchestrator.shutdown();
  const restarted = await restartApp();
  const { body: loaded } = await get<Milestone>(
    restarted.app,
    `/milestones/${created.id}`,
  );
  expect(loaded.features[0]?.acceptedAt).toBe(accepted.features[0]?.acceptedAt);
  await restarted.orchestrator.shutdown();
});

test("starting the next feature links one Full Delivery run", async () => {
  const { body: milestone } = await post<Milestone>(ctx.app, "/milestones", {
    name: "Delivery",
    features: [{ title: "First feature", taskIds: ["TASK-088"] }],
  });
  ctx.engine.anticipate({ as: "Product Manager" }).reports("Ready to build");

  const { status, body: run } = await post<RunState>(
    ctx.app,
    `/milestones/${milestone.id}/start-next`,
    { engine: "claude-code" },
  );

  expect(status).toBe(201);
  expect(run).toMatchObject({
    milestoneId: milestone.id,
    featureId: milestone.features[0]?.id,
    sourceTaskIds: ["TASK-088"],
    pipelineId: "full-delivery",
  });
  await waitForStageStatus(ctx.app, run.id, "intake", "awaiting");
  const { body: linked } = await get<Milestone>(
    ctx.app,
    `/milestones/${milestone.id}`,
  );
  expect(linked.features[0]).toMatchObject({
    status: "in_progress",
    runIds: [run.id],
  });

  const duplicate = await post<{ error: string }>(
    ctx.app,
    `/milestones/${milestone.id}/start-next`,
    {},
  );
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

async function draftMilestone(): Promise<Milestone> {
  const { body } = await post<Milestone>(ctx.app, "/milestones", {
    name: "Milestone E",
    goal: "Ship the editor",
    status: "draft",
  });
  return body;
}

test("editing a draft proposal stamps a new revision", async () => {
  const milestone = await draftMilestone();

  const { status, body } = await patch<Milestone>(
    ctx.app,
    `/milestones/${milestone.id}/proposal`,
    DRAFT_PLAN,
  );

  expect(status).toBe(200);
  expect(body.proposal).toMatchObject({ revision: 1, name: "Milestone E" });
  expect(body.name).toBe("Milestone E");
});

test("a proposal with duplicate feature ids is refused with a path-aware issue", async () => {
  const milestone = await draftMilestone();

  const { status, body } = await patch<{
    error: string;
    issues: { path: (string | number)[]; message: string }[];
  }>(ctx.app, `/milestones/${milestone.id}/proposal`, {
    ...DRAFT_PLAN,
    features: [DRAFT_PLAN.features[0], DRAFT_PLAN.features[0]],
  });

  expect(status).toBe(400);
  expect(body.error).toBe("Invalid request");
  expect(body.issues[0]?.path).toEqual(["features"]);
  expect(body.issues[0]?.message).toContain("unique");
});

test("a proposal whose feature has no acceptance criteria is refused", async () => {
  const milestone = await draftMilestone();

  const { status, body } = await patch<{
    issues: { path: (string | number)[] }[];
  }>(ctx.app, `/milestones/${milestone.id}/proposal`, {
    ...DRAFT_PLAN,
    features: [{ ...DRAFT_PLAN.features[0], acceptanceCriteria: [] }],
  });

  expect(status).toBe(400);
  expect(body.issues[0]?.path).toEqual(["features", 0, "acceptanceCriteria"]);
});

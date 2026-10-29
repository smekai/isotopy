import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import type { Orchestration, OrchestratorDecision, RunState } from "@isotopy/core";
import { resetPreferences } from "../support/preferences";

// The Orchestrator's dialog, without running an engine.
//
// Every orchestration stage spawns a real CLI, so the only free way to cover
// what the *app* does with an initiative is to serve one through route
// interception — the same trick `run/dev-test-flow.e2e.ts` uses for a run.
//
// Both fixtures are typed (`Orchestration`, `RunState`), so a change to either
// model breaks `pnpm --filter @isotopy/ui typecheck` rather than rotting here.

test.beforeEach(async ({ page }) => {
  await resetPreferences(page);
});

const RUN_ID = "e2eorch1";
const ORCHESTRATION_ID = "orch-e2e";
const GOAL = "seeded orchestrator initiative";

test("a proposed team change is shown as a diff of team.md and can be approved", async ({ page }) => {
  // Arrange
  await anticipate(page, awaitingApproval());

  // Act
  await attachSeededRun(page);

  // Assert
  await expect(page.getByTestId("orchestrator-status")).toHaveText("Team change awaiting approval");
  const change = page.getByTestId("orchestrator-team-change");
  await expect(change).toContainText("Verification keeps coming back on its own");
  await expect(change.locator('[data-kind="added"]')).toContainText(["verify:"]);
  await expect(page.getByTestId("approve-team-change")).toBeEnabled();
});

test("an initiative waiting on the user says so, and offers no team change to approve", async ({ page }) => {
  // Arrange
  await anticipate(page, awaitingUser());

  // Act
  await attachSeededRun(page);

  // Assert
  await expect(page.getByTestId("orchestrator-status")).toHaveText("Needs your answer");
  await expect(page.getByTestId("approve-team-change")).toHaveCount(0);
});

test("the Orchestrator's question is answered in the thread it was asked in", async ({ page }) => {
  // Arrange — the seam this whole change removes: the panel used to say
  // "Answer in the Chat tab to continue", pointing at the other tab.
  await anticipate(page, awaitingUser(), askedRun());

  // Act
  await attachSeededRun(page);

  // Assert
  await expect(page.getByTestId("chat-question")).toContainText("Which database?");
  await expect(page.getByTestId("chat-composer")).toBeVisible();
});

test("the initiative has no tab of its own, because it is the conversation", async ({ page }) => {
  // Arrange
  await anticipate(page, awaitingApproval());

  // Act
  await attachSeededRun(page);

  // Assert
  await expect(page.getByTestId("run-tab-team")).toHaveCount(0);
  await expect(page.getByTestId("run-tab-chat")).toBeVisible();
});

test("a child run is linked from the thread, and the thread's own run is not", async ({ page }) => {
  // Arrange — runIds holds both the orchestration run and the team run it started.
  await anticipate(page, awaitingApproval());

  // Act
  await attachSeededRun(page);

  // Assert
  await expect(page.getByTestId("orchestrator-run")).toHaveCount(1);
  await expect(page.getByTestId("orchestrator-run")).toHaveAttribute(
    "data-run-id",
    CHILD_RUN_ID,
  );
});

test("the rail gathers an initiative's runs under its goal", async ({ page }) => {
  // Arrange
  await anticipate(page, awaitingApproval());

  // Act
  await page.goto("/");

  // Assert — two runs that used to stack as unrelated cards now read as one initiative.
  await expect(page.getByTestId("initiative-goal")).toHaveText(GOAL);
  await expect(page.getByTestId("initiative-count")).toHaveText("2");
  await expect(page.getByTestId("run-card")).toHaveCount(2);
});

test("collapsing an initiative hides its runs but keeps it on the rail", async ({ page }) => {
  // Arrange
  await anticipate(page, awaitingApproval());
  await page.goto("/");
  await expect(page.getByTestId("run-card")).toHaveCount(2);

  // Act
  await page.getByTestId("initiative-toggle").click();

  // Assert
  await expect(page.getByTestId("run-card")).toHaveCount(0);
  await expect(page.getByTestId("initiative-goal")).toBeVisible();
});

const CREATED_AT = "2026-07-20T10:00:00.000Z";
const CHILD_RUN_ID = "e2eteam1";

const CHILD_RUN: RunState = {
  id: CHILD_RUN_ID,
  number: 9102,
  projectId: "home",
  orchestrationId: ORCHESTRATION_ID,
  pipelineId: `team-${ORCHESTRATION_ID}`,
  pipelineName: "Delivery pair",
  status: "running",
  task: "Build it and verify it",
  messages: [],
  createdAt: "2026-07-20T10:01:00.000Z",
  stages: [
    {
      id: "implementation",
      label: "Implementing",
      skill: "developer",
      status: "running",
      startedAt: "2026-07-20T10:01:00.000Z",
      logs: [],
    },
  ],
};

const SEEDED_RUN: RunState = {
  id: RUN_ID,
  number: 9101,
  projectId: "home",
  orchestrationId: ORCHESTRATION_ID,
  pipelineId: "orchestration",
  pipelineName: "Orchestration",
  status: "completed",
  task: GOAL,
  engine: "claude-code",
  model: "haiku",
  workspacePath: "/seeded/workspace",
  messages: [],
  createdAt: CREATED_AT,
  completedAt: "2026-07-20T10:00:40.000Z",
  stages: [
    {
      id: "orchestrate",
      label: "Orchestrating",
      skill: "orchestrator",
      status: "passed",
      startedAt: CREATED_AT,
      completedAt: "2026-07-20T10:00:40.000Z",
      logs: [],
    },
  ],
};

function initiative(overrides: Partial<Orchestration>): Orchestration {
  return {
    id: ORCHESTRATION_ID,
    projectId: "home",
    goal: GOAL,
    status: "conversing",
    turns: [],
    runIds: [RUN_ID, CHILD_RUN_ID],
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    ...overrides,
  };
}

const CURRENT_TEAM = ["---", "roster: []", "flows:", "  pair: []", "---", ""].join("\n");

const PROPOSAL: OrchestratorDecision = {
  action: "propose_team_change",
  rationale: "Verification keeps coming back on its own",
  team: ["---", "roster: []", "flows:", "  pair: []", "  verify: []", "---", ""].join("\n"),
};

const QUESTION: OrchestratorDecision = { action: "ask_user", question: "Which database?" };

function awaitingApproval(): Orchestration {
  return initiative({
    status: "awaiting_approval",
    turns: [{ runId: RUN_ID, decision: PROPOSAL, at: "2026-07-20T10:00:30.000Z" }],
    latestDecision: PROPOSAL,
  });
}

function awaitingUser(): Orchestration {
  return initiative({
    status: "awaiting_user",
    turns: [{ runId: RUN_ID, decision: QUESTION, at: "2026-07-20T10:00:30.000Z" }],
    latestDecision: QUESTION,
  });
}

function askedRun(): RunState {
  return {
    ...SEEDED_RUN,
    status: "asking",
    completedAt: undefined,
    messages: [
      {
        id: "q1",
        ts: "2026-07-20T10:00:30.000Z",
        role: "agent",
        kind: "question",
        text: "Which database?",
      },
    ],
  };
}

async function anticipate(
  page: Page,
  orchestration: Orchestration,
  run: RunState = SEEDED_RUN,
): Promise<void> {
  await page.route(
    (url) => url.pathname === "/orchestrations",
    (route) => route.fulfill({ json: [orchestration] }),
  );
  await page.route(
    (url) => url.pathname === "/team",
    (route) => route.fulfill({ json: { state: "invalid", source: "project", text: CURRENT_TEAM, issues: ["roster: too small"] } }),
  );
  await page.route(
    (url) => url.pathname === "/runs",
    (route) => route.fulfill({ json: [run, CHILD_RUN] }),
  );
  await page.route(
    (url) => url.pathname === `/runs/${RUN_ID}`,
    (route) => route.fulfill({ json: run }),
  );
  await page.route(
    (url) => url.pathname === `/runs/${RUN_ID}/files`,
    (route) => route.fulfill({ json: { files: [] } }),
  );
  await page.route(
    (url) => url.pathname === `/runs/${RUN_ID}/events`,
    (route) => route.fulfill({ contentType: "text/event-stream", body: "" }),
  );
}

async function attachSeededRun(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByTestId("run-card").filter({ hasText: GOAL }).click();
  await expect(page.getByTestId("chat-thread")).toBeVisible();
}

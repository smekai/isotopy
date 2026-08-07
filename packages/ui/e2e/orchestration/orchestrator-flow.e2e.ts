import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import type { Orchestration, RunState } from "@adhd/core";
import { resetPreferences } from "../support/preferences";

// The Orchestrator panel, without running an engine.
//
// Every orchestration stage spawns a real CLI, so the only free way to cover
// what the *app* does with an initiative is to serve one through route
// interception — the same trick `run/dev-test-flow.e2e.ts` uses for a run.
//
// Both fixtures are typed (`Orchestration`, `RunState`), so a change to either
// model breaks `pnpm --filter @adhd/ui typecheck` rather than rotting here.

test.beforeEach(async ({ page }) => {
  await resetPreferences(page);
});

const RUN_ID = "e2eorch1";
const ORCHESTRATION_ID = "orch-e2e";
const GOAL = "seeded orchestrator initiative";

test("a proposed team is presented with its roles and can be approved", async ({ page }) => {
  // Arrange
  await anticipate(page, awaitingApproval());

  // Act
  await attachSeededRun(page);

  // Assert
  await expect(page.getByTestId("orchestrator-status")).toHaveText("Team awaiting approval");
  const team = page.getByTestId("orchestrator-team");
  await expect(team).toContainText("Delivery pair");
  await expect(team).toContainText("Developer");
  await expect(team).toContainText("QA Engineer");
  await expect(page.getByTestId("approve-team")).toBeEnabled();
});

test("an initiative waiting on the user says so, and offers no team to approve", async ({ page }) => {
  // Arrange
  await anticipate(page, awaitingUser());

  // Act
  await attachSeededRun(page);

  // Assert
  await expect(page.getByTestId("orchestrator-status")).toHaveText("Needs your answer");
  await expect(page.getByTestId("orchestrator-decision")).toContainText("Which database?");
  await expect(page.getByTestId("approve-team")).toHaveCount(0);
});

test("the run timeline lists the initiative's runs", async ({ page }) => {
  // Arrange
  await anticipate(page, awaitingApproval());

  // Act
  await attachSeededRun(page);

  // Assert
  await expect(page.getByTestId("orchestrator-run")).toHaveCount(1);
  await expect(page.getByTestId("orchestrator-run")).toHaveAttribute("data-run-id", RUN_ID);
});

const CREATED_AT = "2026-07-20T10:00:00.000Z";

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
      label: "Orchestrator",
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
    runIds: [RUN_ID],
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    ...overrides,
  };
}

function awaitingApproval(): Orchestration {
  return initiative({
    status: "awaiting_approval",
    latestDecision: {
      action: "propose_team",
      rationale: "One Developer and one QA Engineer cover this",
      team: {
        name: "Delivery pair",
        summary: "Build it and verify it",
        roles: [
          { id: "implementation", label: "Developer", skill: "developer", stepTask: "implement-feature" },
          { id: "test", label: "QA Engineer", skill: "tester", stepTask: "verify-feature" },
        ],
      },
    },
  });
}

function awaitingUser(): Orchestration {
  return initiative({
    status: "awaiting_user",
    latestDecision: { action: "ask_user", question: "Which database?" },
  });
}

async function anticipate(page: Page, orchestration: Orchestration): Promise<void> {
  await page.route(
    (url) => url.pathname === "/orchestrations",
    (route) => route.fulfill({ json: [orchestration] }),
  );
  await page.route(
    (url) => url.pathname === "/runs",
    (route) => route.fulfill({ json: [SEEDED_RUN] }),
  );
  await page.route(
    (url) => url.pathname === `/runs/${RUN_ID}`,
    (route) => route.fulfill({ json: SEEDED_RUN }),
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
  await expect(page.getByTestId("orchestrator-panel")).toBeVisible();
}

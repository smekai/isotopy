import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import type { ProductProcessStatus, RunState } from "@adhd/core";
import { resetPreferences } from "../support/preferences";

// The Preview tab, without starting anybody's dev server.
//
// The whole point of this surface is that it fails legibly: a dev server that
// refuses framing must say which header refused, rather than showing an empty
// box the user cannot tell from a broken app. That is a rendering question, so
// it needs a browser — and the product status is served through route
// interception, the same trick `run/dev-test-flow.e2e.ts` uses for a run.
//
// The fixtures are typed (`ProductProcessStatus`, `RunState`), so a change to
// either model breaks `pnpm --filter @adhd/ui typecheck` rather than rotting.

test.beforeEach(async ({ page }) => {
  await resetPreferences(page);
});

const RUN_ID = "e2eprev1";
const GOAL = "seeded preview run";
const PRODUCT_URL = "http://127.0.0.1:59998/";

test("a project that never declared how to start itself is offered no Preview tab", async ({ page }) => {
  // Arrange
  await anticipate(page, { state: "stopped", configured: false });

  // Act
  await attachSeededRun(page);

  // Assert
  await expect(page.getByTestId("run-tab-preview")).toHaveCount(0);
});

test("a declared product earns a Preview tab that offers to start it", async ({ page }) => {
  // Arrange
  await anticipate(page, { state: "stopped", configured: true });

  // Act
  await attachSeededRun(page);
  await page.getByTestId("run-tab-preview").click();

  // Assert
  await expect(page.getByTestId("product-start")).toBeVisible();
});

test("a running product is embedded, which is the whole point of the tab", async ({ page }) => {
  // Arrange
  await anticipate(page, running());

  // Act
  await attachSeededRun(page);
  await page.getByTestId("run-tab-preview").click();

  // Assert
  await expect(page.frameLocator("iframe[title='The running product']").locator("body")).toBeAttached();
});

test("a product that refuses framing names the header instead of leaving an empty box", async ({ page }) => {
  // Arrange
  await anticipate(page, running({ framing: { allowed: false, blockedBy: "X-Frame-Options: DENY" } }));

  // Act
  await attachSeededRun(page);
  await page.getByTestId("run-tab-preview").click();

  // Assert
  await expect(page.locator("iframe")).toHaveCount(0);
  await expect(page.getByTestId("product-preview")).toContainText("X-Frame-Options: DENY");
  await expect(page.getByTestId("product-open-external")).toHaveAttribute("href", PRODUCT_URL);
});

function running(overrides: Partial<ProductProcessStatus> = {}): ProductProcessStatus {
  return {
    state: "ready",
    configured: true,
    projectId: "home",
    url: PRODUCT_URL,
    framing: { allowed: true },
    ...overrides,
  };
}

const STARTED_AT = "2026-07-20T10:00:00.000Z";
const FINISHED_AT = "2026-07-20T10:02:00.000Z";

const SEEDED_RUN: RunState = {
  id: RUN_ID,
  number: 9201,
  projectId: "home",
  pipelineId: "pm-dev-test",
  pipelineName: "Product Manager + Developer + QA",
  status: "completed",
  task: GOAL,
  engine: "claude-code",
  model: "haiku",
  result: "Done.",
  stageOutputs: { implementation: "Built it." },
  workspacePath: "/seeded/workspace",
  messages: [],
  createdAt: STARTED_AT,
  completedAt: FINISHED_AT,
  stages: [
    {
      id: "implementation",
      label: "Implementing",
      skill: "developer",
      status: "passed",
      startedAt: STARTED_AT,
      completedAt: FINISHED_AT,
      usage: { costUsd: 0.12, turns: 3 },
      logs: [
        {
          ts: STARTED_AT,
          level: "run",
          message: "Developer online · Claude Code · haiku",
          activity: { kind: "engine", name: "Claude Code" },
        },
        { ts: FINISHED_AT, level: "pass", message: "✓ Developer finished — result ready" },
      ],
    },
  ],
};

async function anticipate(page: Page, product: ProductProcessStatus): Promise<void> {
  await page.route(
    (url) => url.pathname === "/automation/product",
    (route) => route.fulfill({ json: product }),
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
  await page.route(
    (url) => url.href.startsWith(PRODUCT_URL),
    (route) => route.fulfill({ contentType: "text/html", body: "<p>the product</p>" }),
  );
}

async function attachSeededRun(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByTestId("run-card").filter({ hasText: GOAL }).click();
  await expect(page.getByTestId("run-tab-chat")).toBeVisible();
}

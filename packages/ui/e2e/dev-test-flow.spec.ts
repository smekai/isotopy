import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import type { RunState } from "@adhd/core";
import { resetPreferences } from "./support/preferences";

// The Developer+Tester (`dev-test`) two-box flow, without running an engine.
//
// Two tiers live here:
//   free   — the picker and composer for `dev-test`; pure UI, no run at all.
//   seeded — a fabricated dev-test RunState served to the app through route
//            interception, so per-stage rendering (persona badge, verdict,
//            each box's own handoff) is asserted for zero tokens.
//
// The fixture is typed as `RunState`, so a change to the run model breaks
// `pnpm --filter @adhd/ui typecheck` rather than rotting silently here.

test.beforeEach(async ({ page }) => {
  await resetPreferences(page);
});

const RUN_ID = "e2eseed1";

/** Markers that must never appear against the wrong box. */
const DEV_MARKER = "MARKER-WRITTEN-BY-DEVELOPER";
const TESTER_MARKER = "MARKER-WRITTEN-BY-TESTER";

const DEV_OUTPUT = [
  "## Developer report",
  "",
  `Created greet.js and wired it up. ${DEV_MARKER}`,
].join("\n");

const TESTER_OUTPUT = [
  "## Tester report",
  "",
  `Ran the suite against the Developer's code. ${TESTER_MARKER}`,
  "",
  "VERDICT: PASS",
].join("\n");

const STARTED_AT = "2026-07-20T10:00:00.000Z";
const FINISHED_AT = "2026-07-20T10:02:30.000Z";

/**
 * A completed two-box run as the server would report it. `result` deliberately
 * holds only the *last* box's output — that is the trap TASK-047 fell into, and
 * the per-stage assertions below are the guard against falling in again.
 */
const SEEDED_RUN: RunState = {
  id: RUN_ID,
  number: 9001,
  projectId: "home",
  pipelineId: "dev-test",
  pipelineName: "Developer + Tester",
  status: "completed",
  task: "seeded two-box run",
  engine: "claude-code",
  model: "haiku",
  result: TESTER_OUTPUT,
  stageOutputs: { implementation: DEV_OUTPUT, test: TESTER_OUTPUT },
  workspacePath: "/seeded/workspace",
  createdAt: STARTED_AT,
  completedAt: FINISHED_AT,
  stages: [
    {
      id: "implementation",
      label: "Developer",
      skill: "developer",
      status: "passed",
      startedAt: STARTED_AT,
      completedAt: "2026-07-20T10:01:00.000Z",
      logs: [
        { ts: STARTED_AT, level: "info", message: "Developer online · Claude Code · haiku" },
        { ts: "2026-07-20T10:01:00.000Z", level: "pass", message: "✓ Developer finished — result ready" },
      ],
    },
    {
      id: "test",
      label: "Tester",
      skill: "tester",
      verdict: "PASS",
      status: "passed",
      startedAt: "2026-07-20T10:01:00.000Z",
      completedAt: FINISHED_AT,
      logs: [
        { ts: "2026-07-20T10:01:00.000Z", level: "info", message: "Tester online · Claude Code · haiku" },
        { ts: FINISHED_AT, level: "pass", message: "Tester reported VERDICT: PASS" },
      ],
    },
  ],
};

/**
 * Serve the seeded run in place of the server's own. Registered as URL
 * predicates rather than globs so `/runs` can't accidentally swallow
 * `/runs/<id>/events`.
 */
async function seedRun(page: Page): Promise<void> {
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
  // The run is terminal, so the app closes this stream as soon as the initial
  // state lands — an empty event-stream response is enough.
  await page.route(
    (url) => url.pathname === `/runs/${RUN_ID}/events`,
    (route) => route.fulfill({ contentType: "text/event-stream", body: "" }),
  );
}

/** Open the seeded run through the history drawer (it is already finished). */
async function attachSeededRun(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "History" }).click();
  await page.getByTestId("history-card").filter({ hasText: "seeded two-box run" }).click();
  await expect(page.getByTestId("run-status")).toHaveText("COMPLETED");
}

test("dev-test is selectable in the picker and describes both boxes", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Full team" }).click();
  await page.getByRole("option", { name: /Developer \+ Tester/ }).click();

  // The trigger now shows the chosen pipeline, and the composer copy follows.
  await expect(page.getByRole("button", { name: "Developer + Tester" })).toBeVisible();
  await expect(page.getByText("What should the Developer build?")).toBeVisible();
  await expect(page.getByText(/A Developer implements it, then a Tester verifies the result/)).toBeVisible();

  // Engine-backed, so the folder chip and engine caption appear.
  await expect(page.getByTestId("workspace-chip")).toBeVisible();
  await expect(page.getByText(/Engine: Claude Code · sonnet/)).toBeVisible();

  // The ghost pipeline previews exactly two boxes, by profession. (The
  // headline's "Developer" sits in a longer sentence, so `exact` skips it.)
  await expect(page.getByText("Developer", { exact: true })).toHaveCount(1);
  await expect(page.getByText("Tester", { exact: true })).toHaveCount(1);

  // The choice survives a reload (stored server-side), like the other pipelines.
  await page.reload();
  await expect(page.getByRole("button", { name: "Developer + Tester" })).toBeVisible();
});

test("both boxes render as Developer and Tester with their persona badges", async ({ page }) => {
  await seedRun(page);
  await attachSeededRun(page);

  // Status bar carries the engine this run used.
  await expect(page.getByText("⬡ Claude Code · haiku")).toBeVisible();

  await expect(page.getByTestId("stage-node-implementation")).toContainText("Developer");
  await expect(page.getByTestId("stage-node-test")).toContainText("Tester");

  await page.getByTestId("stage-node-implementation").click();
  await expect(page.getByTestId("stage-profession")).toHaveText("Developer");
  await expect(page.getByTestId("stage-persona")).toHaveText("DEVELOPER");
  // Only the verification box declares a verdict.
  await expect(page.getByTestId("stage-verdict")).toHaveCount(0);

  await page.getByTestId("stage-node-test").click();
  await expect(page.getByTestId("stage-profession")).toHaveText("Tester");
  await expect(page.getByTestId("stage-persona")).toHaveText("TESTER");
  await expect(page.getByTestId("stage-verdict")).toHaveText("PASS");
});

test("each box's Artifacts tab shows that box's own handoff.md", async ({ page }) => {
  await seedRun(page);
  await attachSeededRun(page);

  // Regression guard for TASK-047: every stage used to show run.result, which
  // holds only the last box's output.
  await page.getByTestId("stage-node-implementation").click();
  await page.getByRole("button", { name: "Artifacts" }).click();
  await expect(page.getByText("handoff.md")).toBeVisible();
  await expect(page.getByTestId("artifact-preview")).toContainText(DEV_MARKER);
  await expect(page.getByTestId("artifact-preview")).not.toContainText(TESTER_MARKER);

  await page.getByTestId("stage-node-test").click();
  await expect(page.getByTestId("artifact-preview")).toContainText(TESTER_MARKER);
  await expect(page.getByTestId("artifact-preview")).not.toContainText(DEV_MARKER);
});

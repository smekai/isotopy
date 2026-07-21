import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

// The run view, in a browser. Deliberately thin.
//
// Run *semantics* — abort → cancelled, gates, restart, per-stage statuses,
// error contracts — are proven at the API boundary in
// packages/server/test/runs.comp.ts, which is faster and more direct. What is
// left here is only what a component test cannot see: that the React app wires
// a run's state into the status bar, focuses the right stage, streams the log,
// and switches tabs when the run ends. See docs/testing.md.
//
// Runs started here are simulated (`sequential` carries no personas), so no
// engine is ever spawned. Each test leaves its run terminal, keeping the
// empty-state specs' quiet-server assumption intact.

const ALL_STAGES = [
  "intake",
  "requirements",
  "design",
  "implementation",
  "review",
  "test",
  "release",
  "deploy",
];

/** Slow enough for the browser to render each transition, fast enough to watch. */
const STAGE_MS = 1200;

/**
 * Start a simulated run through the API, then attach the UI by reloading — the
 * app re-attaches to whatever run is still in flight on boot. Driving the API
 * is what buys the speed: the timing options are not sent by the composer.
 */
async function startSimulatedRun(page: Page, task: string, enable: string[]): Promise<void> {
  const response = await page.request.post("/runs", {
    data: {
      pipelineId: "sequential",
      task,
      disabledStages: ALL_STAGES.filter((id) => !enable.includes(id)),
      minDurationMs: STAGE_MS,
      maxDurationMs: STAGE_MS,
      failProbability: 0,
    },
  });
  expect(response.status()).toBe(201);
  await page.reload();
}

/** Anchored on a testid: stage nodes render the same status words themselves. */
function runStatus(page: Page) {
  return page.getByTestId("run-status");
}

test("starting a run from the composer renders the run view and streams its log", async ({ page }) => {
  await page.goto("/");
  await page.getByPlaceholder("Describe the task...").fill("e2e composer run");
  await page.getByRole("button", { name: /Start run/ }).click();

  // The empty state is replaced by this run's identity.
  await expect(page.getByText(/^RUN #\d+$/)).toBeVisible();
  await expect(page.getByText("e2e composer run").first()).toBeVisible();
  await expect(runStatus(page)).toHaveText("RUNNING");

  // The first stage is auto-focused and its live log streams in.
  await expect(page.getByTestId("stage-profession")).toHaveText("Project Manager");
  await expect(page.getByText(/Project Manager online · run #\d+/)).toBeVisible();

  // Aborting is reflected in the UI, and the run offers a way back in.
  await page.getByRole("button", { name: "Abort" }).click();
  await expect(runStatus(page)).toHaveText("CANCELLED");
  await expect(page.getByRole("button", { name: /Resume from/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "New run" })).toBeVisible();
});

test("finishing a run moves the focus panel off the stopped log onto Artifacts", async ({ page }) => {
  await page.goto("/");
  await startSimulatedRun(page, "e2e completion run", ["intake", "implementation"]);

  await expect(runStatus(page)).toHaveText("COMPLETED", { timeout: 20_000 });

  // The log has stopped moving, so the panel shows what the run produced
  // without the user having to click.
  await expect(
    page.getByTestId("artifact-preview").or(page.getByText("No artifacts yet.")),
  ).toBeVisible();
});

test("history lists a finished run and clicking it re-attaches", async ({ page }) => {
  await page.goto("/");
  await startSimulatedRun(page, "e2e history run", ["intake", "implementation"]);
  await expect(runStatus(page)).toHaveText("COMPLETED", { timeout: 20_000 });

  // Leave the run, then find it again in history.
  await page.getByRole("button", { name: "New run" }).click();
  await expect(page.getByText("What should the team build?")).toBeVisible();

  await page.getByRole("button", { name: "History" }).click();
  const card = page.getByTestId("history-card").filter({ hasText: "e2e history run" });
  await expect(card.first()).toContainText("COMPLETED");
  await card.first().click();

  await expect(page.getByText("e2e history run").first()).toBeVisible();
  await expect(runStatus(page)).toHaveText("COMPLETED");
});

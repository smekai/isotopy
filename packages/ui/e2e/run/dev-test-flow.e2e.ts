import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import type { RunState } from "@adhd/core";
import { openPipelineComposer } from "../support/composer";
import { resetPreferences } from "../support/preferences";

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



const PM_DEV_TEST = "Product Manager + Developer + QA";

const PM_DEV_TEST_OPTION = new RegExp(PM_DEV_TEST.replace(/\+/g, "\\+"));

test("the default pipeline is selectable in the picker and previews all three boxes", async ({ page }) => {
  // Act
  await page.goto("/");
  await openPipelineComposer(page);
  await page.getByRole("button", { name: PM_DEV_TEST }).click();
  await page.getByRole("option", { name: PM_DEV_TEST_OPTION }).click();

  // Assert — the trigger shows the chosen pipeline, and the composer copy follows.
  await expect(page.getByRole("button", { name: PM_DEV_TEST })).toBeVisible();
  await expect(page.getByText("What do you want to build?")).toBeVisible();
  await expect(
    page.getByText(/A Product Manager works out what to build and recommends an approach/),
  ).toBeVisible();

  // Engine-backed, so the folder chip and engine caption appear.
  await expect(page.getByTestId("workspace-chip")).toBeVisible();
  await expect(page.getByText(/Engine: Claude Code · sonnet/)).toBeVisible();

  // The ghost pipeline previews exactly three boxes, by profession.
  await expect(page.getByText("Product Manager", { exact: true })).toHaveCount(1);
  await expect(page.getByText("Developer", { exact: true })).toHaveCount(1);
  await expect(page.getByText("QA Engineer", { exact: true })).toHaveCount(1);

});

test("the pipeline choice is stored server-side, so it survives a reload", async ({ page }) => {
  // Arrange
  await page.goto("/");
  await openPipelineComposer(page);
  await page.getByRole("button", { name: PM_DEV_TEST }).click();
  await page.getByRole("option", { name: PM_DEV_TEST_OPTION }).click();

  // Act
  await page.reload();

  // Assert
  await openPipelineComposer(page);
  await expect(page.getByRole("button", { name: PM_DEV_TEST })).toBeVisible();
});

test.describe("the seeded, already-finished two-box run", () => {
  // Every test below reads the same finished run, so intercepting it and
  // opening it are shared rather than repeated eight times.
  test.beforeEach(async ({ page }) => {
    await anticipateCompletedRun(page);
    await attachSeededRun(page);
  });

  test("both boxes render as Developer and QA Engineer with their persona badges", async ({ page }) => {
    // Assert — the status bar carries the engine this run used.
    await expect(page.getByText("⬡ Claude Code · haiku")).toBeVisible();
    await expect(page.getByTestId("stage-node-implementation")).toContainText("Developer");
    await expect(page.getByTestId("stage-node-test")).toContainText("QA Engineer");
  });

  test("the Logs tab badges every stage, and only the verifier declares a verdict", async ({ page }) => {
    // Act — the badges live on the Logs tab's per-stage header now that the
    // stage panel is retired.
    await page.getByTestId("run-tab-logs").click();

    // Assert
    await expect(page.getByTestId("stage-profession")).toHaveText(["Developer", "QA Engineer"]);
    await expect(page.getByTestId("stage-persona")).toHaveText(["DEVELOPER", "TESTER"]);
    await expect(page.getByTestId("stage-verdict")).toHaveText(["PASS"]);
  });

  test("clicking a stage node filters the log to that stage", async ({ page }) => {
    await page.getByTestId("run-tab-logs").click();

    // Act — a stage node filters the tab rather than opening a pane.
    await page.getByTestId("stage-node-implementation").click();

    // Assert
    await expect(page.getByTestId("stage-profession")).toHaveText(["Developer"]);
    await expect(page.getByTestId("stage-verdict")).toHaveCount(0);
  });

  test("the chat carries what the boxes said, in order, and nothing else", async ({ page }) => {
    // Assert — the chat is the body of a run now; no stage has to be clicked.
    const thread = page.getByTestId("chat-thread");
    await expect(thread).toContainText(DEV_PROSE);
    await expect(thread).toContainText(TESTER_PROSE);

    const said = await thread.innerText();
    expect(said.indexOf(DEV_PROSE)).toBeLessThan(said.indexOf(TESTER_PROSE));

    // Machinery belongs in the log, not the conversation.
    await expect(thread).not.toContainText("Developer online");
    await expect(thread).not.toContainText("Write greet.js");
    // …but the result does stay: a verdict is not machinery.
    await expect(thread).toContainText("VERDICT: PASS");

    // A finished run cannot be messaged, and says so instead of offering a box.
    await expect(page.getByTestId("chat-composer")).toHaveCount(0);
    await expect(page.getByText(/This run has finished/)).toBeVisible();
  });

  test("the log holds the machinery the chat leaves out", async ({ page }) => {
    // Act
    await page.getByTestId("run-tab-logs").click();

    // Assert
    const log = page.getByTestId("stage-scroll");
    await expect(log).toContainText("Developer online · Claude Code · haiku");
    await expect(log).toContainText("Write greet.js");
    await expect(log).toContainText(DEV_PROSE);
  });

  test("the status bar totals what the run cost", async ({ page }) => {
    // Assert — 0.18 + 0.07, summed across the boxes rather than stored on the run.
    await expect(page.getByTestId("run-cost")).toHaveText("$0.25");
  });

  test("the Artifacts tab opens on the first box's own handoff.md", async ({ page }) => {
    // Act
    await page.getByTestId("run-tab-artifacts").click();

    // Assert — regression guard for TASK-047: every stage used to show
    // run.result, which holds only the last box's output.
    await expect(page.getByText("implementation/handoff.md")).toBeVisible();
    await expect(page.getByTestId("artifact-preview")).toContainText(DEV_MARKER);
    await expect(page.getByTestId("artifact-preview")).not.toContainText(TESTER_MARKER);
  });

  test("picking the other box's handoff swaps the preview to its output", async ({ page }) => {
    await page.getByTestId("run-tab-artifacts").click();

    // Act
    await page.getByText("test/handoff.md").click();

    // Assert
    await expect(page.getByTestId("artifact-preview")).toContainText(TESTER_MARKER);
    await expect(page.getByTestId("artifact-preview")).not.toContainText(DEV_MARKER);
  });

  test("the solution folder is one click from the run, not three", async ({ page }) => {
    await page.getByTestId("run-tab-artifacts").click();

    // Act
    await page.getByTestId("artifact-view-files").click();

    // Assert
    await expect(page.getByTestId("artifact-files")).toBeVisible();
  });
});

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

/** What each box actually *said* — `info` logs, the only thing chat renders. */
const DEV_PROSE = "I created greet.js and wired it into the entry point.";
const TESTER_PROSE = "I ran the suite; every case passes.";

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
  messages: [],
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
      usage: { costUsd: 0.18, turns: 4 },
      logs: [
        { ts: STARTED_AT, level: "run", message: "Developer online · Claude Code · haiku", activity: { kind: "engine", name: "Claude Code" } },
        { ts: "2026-07-20T10:00:20.000Z", level: "info", message: DEV_PROSE },
        { ts: "2026-07-20T10:00:30.000Z", level: "run", message: "▶ Write greet.js", activity: { kind: "tool", name: "Write greet.js" } },
        { ts: "2026-07-20T10:01:00.000Z", level: "pass", message: "✓ Developer finished — result ready" },
      ],
    },
    {
      id: "test",
      label: "QA Engineer",
      skill: "tester",
      verdict: "PASS",
      status: "passed",
      startedAt: "2026-07-20T10:01:00.000Z",
      completedAt: FINISHED_AT,
      usage: { costUsd: 0.07, turns: 2 },
      logs: [
        { ts: "2026-07-20T10:01:00.000Z", level: "run", message: "QA Engineer online · Claude Code · haiku", activity: { kind: "engine", name: "Claude Code" } },
        { ts: "2026-07-20T10:01:30.000Z", level: "info", message: TESTER_PROSE },
        { ts: FINISHED_AT, level: "pass", message: "QA Engineer reported VERDICT: PASS" },
      ],
    },
  ],
};

/**
 * Serve the seeded run in place of the server's own. Registered as URL
 * predicates rather than globs so `/runs` can't accidentally swallow
 * `/runs/<id>/events`.
 */
async function anticipateCompletedRun(page: Page): Promise<void> {
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

/** Open the seeded run from the run rail (it is already finished). */
async function attachSeededRun(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByTestId("run-card").filter({ hasText: "seeded two-box run" }).click();
  await expect(page.getByTestId("run-status")).toHaveText("COMPLETED");
}

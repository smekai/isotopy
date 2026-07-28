import { expect, test } from "@playwright/test";

// Live tier — the ONLY test in the repo that spends money.
//
// Skipped unless ADHD_E2E_LIVE=1, so `pnpm e2e` stays free and fast.
//
// This is now a **canary, not a proof**. That the two boxes chain — the Tester
// handed the Developer's report, both working in one shared workspace, a FAIL
// verdict failing the run — is proven for free by
// packages/server/test/dev-test-pipeline.comp.ts against a mocked adapter.
// What no cheaper layer can tell us is whether the *real* Claude Code CLI still
// integrates: that it is found on PATH, authenticates, honours --model, streams
// parseable output, and writes files where we expect. That is this test's job,
// and the only reason to spend on it.
//
// Requirements when enabled:
//   - an authenticated `claude` CLI on PATH;
//   - a dev server started OUTSIDE a sandboxed agent shell — a sandboxed spawn
//     dies with 0xC0000142 (see the run-app skill).
//
// Cost: one haiku run, roughly a cent.
//
//   ADHD_E2E_LIVE=1 pnpm --filter @adhd/ui e2e live-dev-test

const LIVE = process.env.ADHD_E2E_LIVE === "1";

/** Deliberately tiny: the point is the handoff, not the coding. */
const TASK =
  "Create a file named hello-adhd.txt containing exactly the text: hello from the two-box run. Do nothing else.";

test("the real Claude Code CLI still drives a two-box run end to end", async ({ page }) => {
  test.skip(!LIVE, "live tier — set ADHD_E2E_LIVE=1 to run (spends real tokens)");
  // A real two-box run is minutes, not seconds.
  test.setTimeout(10 * 60_000);

  await page.goto("/");

  // The run works in the active project's folder, so switch to Home first: its
  // runs get a scratch workspace each and cannot touch real code.
  await page.getByTestId("project-switcher").click();
  await page.getByRole("option", { name: /Home/ }).click();

  // Cheapest model.
  await page.getByRole("button", { name: "Setup" }).click();
  await page.getByRole("button", { name: "AI Harness" }).click();
  await page.locator("select").selectOption("haiku");
  await page.getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: "Developer + Tester" }).click();
  await page.getByRole("option", { name: /Developer \+ Tester/ }).click();
  await page.getByPlaceholder("Describe the task...").fill(TASK);
  await page.getByRole("button", { name: /Start run/ }).click();

  await expect(page.getByText("⬡ Claude Code · haiku")).toBeVisible();
  await expect(page.getByTestId("run-status")).toHaveText("RUNNING");

  // Box 1 runs first, and the Logs tab names it with its persona.
  await page.getByTestId("run-tab-logs").click();
  await expect(page.getByTestId("stage-profession").first()).toHaveText("Developer", {
    timeout: 120_000,
  });
  await expect(page.getByTestId("stage-persona").first()).toHaveText("DEVELOPER");

  // Box 2 only starts once box 1 has passed — that ordering is the chain.
  await expect(page.getByTestId("stage-node-implementation")).toContainText("PASSED", {
    timeout: 8 * 60_000,
  });
  await expect(page.getByTestId("stage-node-test")).toContainText("PASSED", {
    timeout: 8 * 60_000,
  });
  await expect(page.getByTestId("run-status")).toHaveText("COMPLETED");

  // A real run reports what it spent, so the total is on the status bar.
  await expect(page.getByTestId("run-cost")).toContainText("$");

  // The Tester declared a verdict, and each box reported its own handoff.
  await expect(page.getByTestId("stage-verdict")).toHaveText(["PASS"]);

  await page.getByTestId("run-tab-artifacts").click();
  await expect(page.getByTestId("artifact-preview")).not.toBeEmpty();
  const developerHandoff = await page.getByTestId("artifact-preview").innerText();

  await page.getByText("test/handoff.md").click();
  await expect(page.getByTestId("artifact-preview")).not.toHaveText(developerHandoff);

  // Both boxes shared one workspace, so the produced file is in the solution folder.
  await page.getByTestId("artifact-view-files").click();
  await expect(page.getByTestId("artifact-files")).toContainText("hello-adhd.txt");
});

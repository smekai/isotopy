import { expect, test } from "@playwright/test";
import { readPreferences, resetPreferences, writePreferences } from "./support/preferences";

// Free tier of docs/e2e-test-plan.md: picker, Setup modal, persistence,
// run rail. Starts no runs — safe to execute on every change.
// Assumes a quiet server (no in-flight run, otherwise the composer
// is replaced by the run view).

test.beforeEach(async ({ page }) => {
  await resetPreferences(page);
});

test("empty state shows the pipeline dropdown and a disabled start button", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Developer + Tester" })).toBeVisible();
  await expect(page.getByText("What should the Developer build?")).toBeVisible();
  await expect(page.getByRole("button", { name: /Start run/ })).toBeDisabled();

  // the dropdown opens with every pipeline and closes on Escape
  await page.getByRole("button", { name: "Developer + Tester" }).click();
  await expect(page.getByRole("option")).toHaveCount(3);
  await expect(page.getByRole("option", { name: /Single agent/ })).toBeVisible();
  await expect(page.getByRole("option", { name: /Developer \+ approval \+ Tester/ })).toBeVisible();
  await expect(page.getByRole("option", { name: "Developer + Tester" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("option", { name: /Single agent/ })).toBeHidden();

  await page.getByPlaceholder("Describe the task...").fill("smoke");
  await expect(page.getByRole("button", { name: /Start run/ })).toBeEnabled();
});

test("single-agent mode shows the folder as read-only context, not an input", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Developer + Tester" }).click();
  await page.getByRole("option", { name: /Single agent/ }).click();

  await expect(page.getByText("What should the Developer build?")).toBeVisible();
  await expect(page.getByText(/Engine: Claude Code · sonnet/)).toBeVisible();

  // The folder is the project's, so the composer states it and offers no way
  // to type another one.
  await expect(page.getByTestId("workspace-chip")).toBeVisible();
  await expect(page.getByPlaceholder(/Working directory/)).toHaveCount(0);
});

test("Setup → AI Harness lists engines, status, models, and permission modes", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Setup" }).click();
  await page.getByRole("button", { name: "AI Harness" }).click();

  // All three harnesses ship now — nothing is left behind a SOON pill.
  await expect(page.getByRole("button", { name: /Claude Code Anthropic's agentic coding CLI/ })).toBeEnabled();
  await expect(page.getByRole("button", { name: /Cursor Cursor CLI agent/ })).toBeEnabled();
  await expect(page.getByRole("button", { name: /Codex OpenAI Codex CLI/ })).toBeEnabled();
  await expect(page.getByText("SOON", { exact: true })).toHaveCount(0);

  await expect(page.getByText("Engine status")).toBeVisible();
  await expect(page.getByRole("button", { name: /Re-check/ })).toBeVisible();

  // Default engine is claude-code. The roster is resolved server-side and can
  // come from the CLI, so assert the entries that matter rather than a count.
  const model = page.locator("select");
  await expect(model).toBeVisible();
  await expect(model).toHaveValue("sonnet");
  for (const id of ["", "opus", "sonnet", "haiku"]) {
    await expect(model.locator(`option[value="${id}"]`)).toHaveCount(1);
  }

  await expect(page.getByRole("button", { name: /Never block \(recommended\)/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Accept edits only/ })).toBeVisible();
});

test("AI Harness lists the Claude connection modes inline", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Setup" }).click();
  await page.getByRole("button", { name: "AI Harness" }).click();

  // Connection modes now live inside the AI Harness section (no separate tab).
  await expect(page.getByRole("button", { name: /Claude subscription/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Anthropic API key/ })).toBeVisible();
});

test("selecting Cursor swaps the model options and connection modes", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Setup" }).click();
  await page.getByRole("button", { name: "AI Harness" }).click();
  await page.getByRole("button", { name: /Cursor Cursor CLI agent/ }).click();

  // Cursor defaults to Auto (""), which lets the CLI pick. Its roster comes
  // from `agent models` when the CLI is installed, so only Auto is guaranteed.
  const model = page.locator("select");
  await expect(model).toHaveValue("");
  await expect(model.locator('option[value=""]')).toHaveText(/Auto/);

  // connection modes render in the same section — visibility only (clicking persists)
  await expect(page.getByRole("button", { name: /Cursor subscription/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Cursor API key/ })).toBeVisible();

  // the engine is stored per project now; restore the default for later tests
  await page.getByRole("button", { name: /Claude Code Anthropic's agentic coding CLI/ }).click();
  await expect(page.locator("select")).toHaveValue("sonnet");
});

test("pipeline, model, and permission mode persist across a reload", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Developer + Tester" }).click();
  await page.getByRole("option", { name: /Single agent/ }).click();

  await page.getByRole("button", { name: "Setup" }).click();
  await page.getByRole("button", { name: "AI Harness" }).click();
  await page.locator("select").selectOption("haiku");
  await page.getByRole("button", { name: /Accept edits only/ }).click();
  await page.getByRole("button", { name: "Close" }).click();

  await page.reload();

  // pipeline + model resurface in the empty-state caption
  await expect(page.getByText("What should the Developer build?")).toBeVisible();
  await expect(page.getByText(/Engine: Claude Code · haiku/)).toBeVisible();

  // Setup select reflects the stored model
  await page.getByRole("button", { name: "Setup" }).click();
  await page.getByRole("button", { name: "AI Harness" }).click();
  await expect(page.locator("select")).toHaveValue("haiku");

  // permission mode is stored server-side (UI selection is style-only)
  expect((await readPreferences(page)).permissionMode).toBe("acceptEdits");
});

test("preferences survive a browser with no storage of its own", async ({ page }) => {
  await page.goto("/");
  await writePreferences(page, { pipelineId: "one-box" });

  // Wiping storage is what "open it in another browser" means: nothing is
  // carried over but the server's own state.
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  await expect(page.getByText("What should the Developer build?")).toBeVisible();
});

test("legacy full model IDs migrate to standard-context CLI aliases", async ({ page }) => {
  await page.goto("/");
  await writePreferences(page, { engineModels: { "claude-code": "claude-sonnet-4-6" } });
  await page.reload();

  await page.getByRole("button", { name: "Developer + Tester" }).click();
  await page.getByRole("option", { name: /Single agent/ }).click();
  await expect(page.getByText(/Engine: Claude Code · sonnet/)).toBeVisible();

  // the alias is rewritten in the active project's own stored preferences
  expect((await readPreferences(page)).engineModels["claude-code"]).toBe("sonnet");
});

test("a preference left in localStorage by an older build is adopted once", async ({ page }) => {
  await page.goto("/");
  await writePreferences(page, { pipelineId: "one-box" });
  const { activeProjectId } = (await (await page.request.get("/projects")).json()) as {
    activeProjectId: string;
  };
  await page.evaluate(
    (id) => localStorage.setItem(`adhd.${id}.pipelineId`, "dev-test"),
    activeProjectId,
  );
  await page.reload();

  await expect(page.getByText("What should the Developer build?")).toBeVisible();
  await expect
    .poll(async () => (await readPreferences(page)).pipelineId)
    .toBe("dev-test");
  // adopted once: the key is gone, so a later server-side change is not undone
  expect(
    await page.evaluate((id) => localStorage.getItem(`adhd.${id}.pipelineId`), activeProjectId),
  ).toBeNull();
});

test("the run rail is always present and offers a new run", async ({ page }) => {
  await page.goto("/");

  const rail = page.getByRole("navigation", { name: "Runs" });
  await expect(rail).toBeVisible();
  await expect(rail.getByRole("button", { name: "New run" })).toBeVisible();

  // fresh server → empty message; otherwise at least one run card exists
  await expect(
    page.getByText("No runs yet.").or(page.getByTestId("run-card").first()),
  ).toBeVisible();
});

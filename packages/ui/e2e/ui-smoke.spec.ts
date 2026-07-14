import { expect, test } from "@playwright/test";

// Free tier of docs/e2e-test-plan.md: picker, Setup modal, persistence,
// history drawer. Starts no runs — safe to execute on every change.
// Assumes a quiet server (no in-flight run, otherwise the empty state
// is replaced by the run view).

test("empty state shows the pipeline picker and a disabled start button", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Full team · mock" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Single agent" })).toBeVisible();
  await expect(page.getByText("What should the team build?")).toBeVisible();
  await expect(page.getByRole("button", { name: /Start run/ })).toBeDisabled();

  await page.getByPlaceholder("Describe the task...").fill("smoke");
  await expect(page.getByRole("button", { name: /Start run/ })).toBeEnabled();
});

test("single-agent mode reveals the workspace input and engine caption", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Single agent" }).click();

  await expect(page.getByText("What should the Developer build?")).toBeVisible();
  await expect(page.getByPlaceholder(/Working directory/)).toBeVisible();
  await expect(page.getByText(/Engine: Claude Code · claude-/)).toBeVisible();
});

test("Setup → AI Harness lists engines, models, and permission modes", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Setup" }).click();
  await page.getByRole("button", { name: "AI Harness" }).click();

  await expect(page.getByRole("button", { name: /Claude Code Anthropic's agentic coding CLI/ })).toBeVisible();
  await expect(page.getByText("SOON", { exact: true })).toHaveCount(2);

  const model = page.locator("select");
  await expect(model).toBeVisible();
  await expect(model.locator("option")).toHaveCount(3);

  await expect(page.getByRole("button", { name: /Never block \(recommended\)/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Accept edits only/ })).toBeVisible();
});

test("pipeline, model, and permission mode persist across a reload", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Single agent" }).click();

  await page.getByRole("button", { name: "Setup" }).click();
  await page.getByRole("button", { name: "AI Harness" }).click();
  await page.locator("select").selectOption("claude-haiku-4-5");
  await page.getByRole("button", { name: /Accept edits only/ }).click();
  await page.getByRole("button", { name: "Close" }).click();

  await page.reload();

  // pipeline + model resurface in the empty-state caption
  await expect(page.getByText("What should the Developer build?")).toBeVisible();
  await expect(page.getByText(/Engine: Claude Code · claude-haiku-4-5/)).toBeVisible();

  // Setup select reflects the stored model
  await page.getByRole("button", { name: "Setup" }).click();
  await page.getByRole("button", { name: "AI Harness" }).click();
  await expect(page.locator("select")).toHaveValue("claude-haiku-4-5");

  // permission mode is stored (UI selection is style-only, so assert storage)
  const stored = await page.evaluate(() => localStorage.getItem("adhd.permissionMode"));
  expect(stored).toBe("acceptEdits");
});

test("history drawer opens and renders", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "History" }).click();

  await expect(page.getByText("Run History")).toBeVisible();
  // fresh server → empty message; otherwise at least one run card exists
  await expect(page.getByText("No runs yet.").or(page.getByText(/^#\d+$/).first())).toBeVisible();
});

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

// Free tier of docs/e2e-test-plan.md: picker, Setup modal, persistence,
// history drawer. Starts no runs — safe to execute on every change.
// Assumes a quiet server (no in-flight run, otherwise the empty state
// is replaced by the run view).

/**
 * Preferences are scoped by project id, so a storage assertion has to ask the
 * server which project is active rather than hardcoding a key.
 */
async function prefKey(page: Page, name: string): Promise<string> {
  const response = await page.request.get("/projects");
  const { activeProjectId } = (await response.json()) as { activeProjectId: string };
  return `adhd.${activeProjectId}.${name}`;
}

test("empty state shows the pipeline dropdown and a disabled start button", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Full team" })).toBeVisible();
  await expect(page.getByText("What should the team build?")).toBeVisible();
  await expect(page.getByRole("button", { name: /Start run/ })).toBeDisabled();

  // the dropdown opens with every pipeline and closes on Escape
  await page.getByRole("button", { name: "Full team" }).click();
  await expect(page.getByRole("option")).toHaveCount(3);
  await expect(page.getByRole("option", { name: /Full team/ })).toBeVisible();
  await expect(page.getByRole("option", { name: /Single agent/ })).toBeVisible();
  await expect(page.getByRole("option", { name: /Developer \+ Tester/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("option", { name: /Single agent/ })).toBeHidden();

  await page.getByPlaceholder("Describe the task...").fill("smoke");
  await expect(page.getByRole("button", { name: /Start run/ })).toBeEnabled();
});

test("single-agent mode shows the folder as read-only context, not an input", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Full team" }).click();
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

  // engine choice is localStorage-only; restore the default for later tests
  await page.getByRole("button", { name: /Claude Code Anthropic's agentic coding CLI/ }).click();
  await expect(page.locator("select")).toHaveValue("sonnet");
});

test("pipeline, model, and permission mode persist across a reload", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Full team" }).click();
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

  // permission mode is stored (UI selection is style-only, so assert storage)
  const stored = await page.evaluate(
    (key) => localStorage.getItem(key),
    await prefKey(page, "permissionMode"),
  );
  expect(stored).toBe("acceptEdits");
});

test("legacy full model IDs migrate to standard-context CLI aliases", async ({ page }) => {
  await page.goto("/");
  const modelKey = await prefKey(page, "engineModel.claude-code");
  await page.evaluate((key) => localStorage.setItem(key, "claude-sonnet-4-6"), modelKey);
  await page.reload();

  await page.getByRole("button", { name: "Full team" }).click();
  await page.getByRole("option", { name: /Single agent/ }).click();
  await expect(page.getByText(/Engine: Claude Code · sonnet/)).toBeVisible();

  // the alias is rewritten in place, in the active project's own key
  const stored = await page.evaluate((key) => localStorage.getItem(key), modelKey);
  expect(stored).toBe("sonnet");
});

test("history drawer opens and renders", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "History" }).click();

  await expect(page.getByText("Run History")).toBeVisible();
  // fresh server → empty message; otherwise at least one run card exists
  await expect(page.getByText("No runs yet.").or(page.getByText(/^#\d+$/).first())).toBeVisible();
});

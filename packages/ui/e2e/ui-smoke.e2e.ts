import { expect, test } from "@playwright/test";
import { openPipelineComposer } from "./support/composer";
import { readPreferences, resetPreferences, writePreferences } from "./support/preferences";

// Free tier of docs/e2e-test-plan.md: picker, Setup modal, persistence,
// run rail. Starts no runs — safe to execute on every change.
// Assumes a quiet server (no in-flight run, otherwise the composer
// is replaced by the run view).

test.beforeEach(async ({ page }) => {
  await resetPreferences(page);
});

const DEFAULT_PIPELINE = "Product Manager + Developer + QA";

test("home leads with the Orchestrator, which cannot start until a goal is described", async ({ page }) => {
  // Act
  await page.goto("/");

  // Assert
  await expect(page.getByText("What are we building?")).toBeVisible();
  await expect(page.getByRole("button", { name: /Start Orchestrator/ })).toBeDisabled();
  await expect(page.getByPlaceholder("Describe the goal...")).toBeVisible();
});

test("describing a goal arms the Orchestrator", async ({ page }) => {
  // Arrange
  await page.goto("/");

  // Act
  await page.getByPlaceholder("Describe the goal...").fill("smoke");

  // Assert
  await expect(page.getByRole("button", { name: /Start Orchestrator/ })).toBeEnabled();
});

test("the fixed pipeline composer is one click behind the Orchestrator", async ({ page }) => {
  // Arrange
  await page.goto("/");

  // Act
  await openPipelineComposer(page);

  // Assert
  await expect(page.getByRole("button", { name: DEFAULT_PIPELINE })).toBeVisible();
  await expect(page.getByText("What do you want to build?")).toBeVisible();
  await expect(page.getByRole("button", { name: /Start run/ })).toBeDisabled();
});

test("the pipeline dropdown offers every pipeline and closes on Escape", async ({ page }) => {
  // Arrange
  await page.goto("/");
  await openPipelineComposer(page);

  // Act
  await page.getByRole("button", { name: DEFAULT_PIPELINE }).click();

  // Assert
  await expect(page.getByRole("option")).toHaveCount(3);
  await expect(page.getByRole("option", { name: /Full Delivery/ })).toBeVisible();
  await expect(page.getByRole("option", { name: /Single agent/ })).toBeVisible();
  await expect(page.getByRole("option", { name: /Product Manager \+ Developer \+ QA/ })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("option", { name: /Single agent/ })).toBeHidden();
});

test("describing a task arms both Start run and Plan milestone", async ({ page }) => {
  // Arrange
  await page.goto("/");
  await openPipelineComposer(page);

  // Act
  await page.getByPlaceholder("Describe the task...").fill("smoke");

  // Assert
  await expect(page.getByRole("button", { name: /Start run/ })).toBeEnabled();
  await expect(page.getByTestId("plan-milestone")).toBeEnabled();
});

test("Full Delivery previews the revised persona team", async ({ page }) => {
  // Arrange
  await page.goto("/");
  await openPipelineComposer(page);
  await page.getByRole("button", { name: DEFAULT_PIPELINE }).click();

  // Act
  await page.getByRole("option", { name: /Full Delivery/ }).click();

  // Assert
  await expect(page.getByText("What should the delivery team build?")).toBeVisible();
  await expect(page.getByText("Product Manager", { exact: true })).toHaveCount(2);
  await expect(page.getByText("Product Designer", { exact: true })).toHaveCount(1);
  await expect(page.getByText("Software Architect", { exact: true })).toHaveCount(2);
  await expect(page.getByText("Developer", { exact: true })).toHaveCount(1);
  await expect(page.getByText("QA Engineer", { exact: true })).toHaveCount(1);
  await expect(page.getByText("Release Manager", { exact: true })).toHaveCount(1);
  await expect(page.getByText("SRE", { exact: true })).toHaveCount(1);
});

test("single-agent mode shows the folder as read-only context, not an input", async ({ page }) => {
  // Arrange
  await page.goto("/");
  await openPipelineComposer(page);
  await page.getByRole("button", { name: DEFAULT_PIPELINE }).click();

  // Act
  await page.getByRole("option", { name: /Single agent/ }).click();

  // Assert
  await expect(page.getByText("What should the Agent build?")).toBeVisible();
  await expect(page.getByText(/Engine: Claude Code · sonnet/)).toBeVisible();

  // The folder is the project's, so the composer states it and offers no way
  // to type another one.
  await expect(page.getByTestId("workspace-chip")).toBeVisible();
  await expect(page.getByPlaceholder(/Working directory/)).toHaveCount(0);
});

test("Setup → AI Harness lists engines, status, models, and permission modes", async ({ page }) => {
  // Arrange
  await page.goto("/");
  await page.getByRole("button", { name: "Setup" }).click();

  // Act
  await page.getByRole("button", { name: "AI Harness" }).click();

  // Assert — all three harnesses ship now — nothing is left behind a SOON pill.
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
  const offered = await model
    .locator("option")
    .evaluateAll<string[], HTMLOptionElement>((options) => options.map((option) => option.value));
  expect(offered).toEqual(expect.arrayContaining(["", "opus", "sonnet", "haiku"]));

  await expect(page.getByRole("button", { name: /Never block \(recommended\)/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Accept edits only/ })).toBeVisible();
});

test("AI Harness lists the Claude connection modes inline", async ({ page }) => {
  // Arrange
  await page.goto("/");
  await page.getByRole("button", { name: "Setup" }).click();

  // Act
  await page.getByRole("button", { name: "AI Harness" }).click();

  // Assert — connection modes live inside AI Harness now, with no separate tab.
  await expect(page.getByRole("button", { name: /Claude subscription/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Anthropic API key/ })).toBeVisible();
});

test("selecting Cursor swaps the model options and connection modes", async ({ page }) => {
  // Arrange
  await page.goto("/");
  await page.getByRole("button", { name: "Setup" }).click();
  await page.getByRole("button", { name: "AI Harness" }).click();

  // Act
  await page.getByRole("button", { name: /Cursor Cursor CLI agent/ }).click();

  // Assert — Cursor defaults to Auto (""), which lets the CLI pick. Its roster comes
  // from `agent models` when the CLI is installed, so only Auto is guaranteed.
  const model = page.locator("select");
  await expect(model).toHaveValue("");
  await expect(model.locator('option[value=""]')).toHaveText(/Auto/);

  // connection modes render in the same section — visibility only (clicking persists)
  await expect(page.getByRole("button", { name: /Cursor subscription/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Cursor API key/ })).toBeVisible();

  // Cleanup: the engine is stored per project now, so restore the default.
  await page.getByRole("button", { name: /Claude Code Anthropic's agentic coding CLI/ }).click();
  await expect(page.locator("select")).toHaveValue("sonnet");
});

test("pipeline, model, and permission mode persist across a reload", async ({ page }) => {
  // Arrange — change all three, then close Setup.
  await page.goto("/");
  await openPipelineComposer(page);
  await page.getByRole("button", { name: "Product Manager + Developer + QA" }).click();
  await page.getByRole("option", { name: /Single agent/ }).click();

  await page.getByRole("button", { name: "Setup" }).click();
  await page.getByRole("button", { name: "AI Harness" }).click();
  await page.locator("select").selectOption("haiku");
  await page.getByRole("button", { name: /Accept edits only/ }).click();
  await page.getByRole("button", { name: "Close" }).click();

  // Act
  await page.reload();

  // Assert — the pipeline composer is where a stored pipeline is visible at all.
  await openPipelineComposer(page);
  await expect(page.getByText("What should the Agent build?")).toBeVisible();
  await expect(page.getByText(/Engine: Claude Code · haiku/)).toBeVisible();

  // Setup select reflects the stored model
  await page.getByRole("button", { name: "Setup" }).click();
  await page.getByRole("button", { name: "AI Harness" }).click();
  await expect(page.locator("select")).toHaveValue("haiku");

  // permission mode is stored server-side (UI selection is style-only)
  expect((await readPreferences(page)).permissionMode).toBe("acceptEdits");
});

test("preferences survive a browser with no storage of its own", async ({ page }) => {
  // Arrange — wiping storage is what "open it in another browser" means:
  // nothing is carried over but the server's own state.
  await page.goto("/");
  await writePreferences(page, { pipelineId: "solo" });
  await page.evaluate(() => localStorage.clear());

  // Act
  await page.reload();

  // Assert
  await openPipelineComposer(page);
  await expect(page.getByText("What should the Agent build?")).toBeVisible();
});

test("legacy full model IDs migrate to standard-context CLI aliases", async ({ page }) => {
  // Arrange
  await page.goto("/");
  await writePreferences(page, { engineModels: { "claude-code": "claude-sonnet-4-6" } });

  // Act
  await page.reload();

  // Assert
  await openPipelineComposer(page);
  await page.getByRole("button", { name: DEFAULT_PIPELINE }).click();
  await page.getByRole("option", { name: /Single agent/ }).click();
  await expect(page.getByText(/Engine: Claude Code · sonnet/)).toBeVisible();
  // the alias is rewritten in the active project's own stored preferences
  expect((await readPreferences(page)).engineModels["claude-code"]).toBe("sonnet");
});

test("a preference left in localStorage by an older build is adopted once", async ({ page }) => {
  // Arrange
  await page.goto("/");
  await writePreferences(page, { pipelineId: "pm-dev-test" });
  const { activeProjectId } = (await (await page.request.get("/projects")).json()) as {
    activeProjectId: string;
  };
  await page.evaluate(
    (id) => localStorage.setItem(`adhd.${id}.pipelineId`, "solo"),
    activeProjectId,
  );
  // Act
  await page.reload();

  // Assert
  await openPipelineComposer(page);
  await expect(page.getByText("What should the Agent build?")).toBeVisible();
  await expect
    .poll(async () => (await readPreferences(page)).pipelineId)
    .toBe("solo");
  // adopted once: the key is gone, so a later server-side change is not undone
  expect(
    await page.evaluate((id) => localStorage.getItem(`adhd.${id}.pipelineId`), activeProjectId),
  ).toBeNull();
});

test("the run rail is always present and offers a new run", async ({ page }) => {
  // Act
  await page.goto("/");

  // Assert
  const rail = page.getByRole("navigation", { name: "Runs" });
  await expect(rail).toBeVisible();
  await expect(rail.getByRole("button", { name: "New run" })).toBeVisible();

  // fresh server → empty message; otherwise at least one run card exists
  await expect(
    page.getByText("No runs yet.").or(page.getByTestId("run-card").first()),
  ).toBeVisible();
});

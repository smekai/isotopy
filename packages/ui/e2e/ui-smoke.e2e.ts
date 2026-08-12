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
  await expect(page.getByRole("listbox").getByRole("option")).toHaveCount(3);
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
  await expect(page.getByTestId("start-engine")).toHaveValue("claude-code");
  await expect(page.getByTestId("start-tier")).toHaveValue("balanced");

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

  // The model choice is an intent, not a roster: model ids turn over monthly, the
  // ladder does not. What it resolved to on this machine is shown, never implied.
  await expect(page.getByRole("button", { name: /Auto whatever the harness/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Fast quick and cheap/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Balanced the everyday default/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Deep more reasoning/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Max most reasoning/ })).toBeVisible();
  await expect(page.getByText(/^→ /)).toBeVisible();

  // The exact roster is still reachable, one disclosure away, for the expert case.
  await expect(page.getByTestId("model-select")).toHaveCount(0);
  await page.getByRole("button", { name: /Pick an exact model instead/ }).click();
  const model = page.getByTestId("model-select");
  await expect(model).toBeVisible();
  const offered = await model
    .locator("option")
    .evaluateAll<string[], HTMLOptionElement>((options) => options.map((option) => option.value));
  expect(offered).toEqual(expect.arrayContaining(["", "fable", "opus", "sonnet", "haiku"]));
  await expect(model.locator("optgroup")).toHaveCount(2);
  await expect(model.locator("optgroup").nth(1)).toHaveAttribute("label", /checked \d{4}-\d{2}-\d{2}/);

  await expect(page.getByRole("button", { name: /Never block \(recommended\)/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Auto-review/ })).toBeVisible();
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

test("selecting Cursor keeps the preset and re-resolves it against that harness", async ({ page }) => {
  // Arrange
  await page.goto("/");
  await page.getByRole("button", { name: "Setup" }).click();
  await page.getByRole("button", { name: "AI Harness" }).click();
  const resolution = page.getByText(/^→ /);
  const onClaude = await resolution.textContent();

  // Act
  await page.getByRole("button", { name: /Cursor Cursor CLI agent/ }).click();

  // Assert — a preset survives switching harness, which is the whole point of one;
  // what it stands for is re-resolved against the new harness's own roster.
  await expect(resolution).not.toHaveText(onClaude ?? "");

  // connection modes render in the same section — visibility only (clicking persists)
  await expect(page.getByRole("button", { name: /Cursor subscription/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Cursor API key/ })).toBeVisible();

  // Cleanup: the engine is stored per project now, so restore the default.
  await page.getByRole("button", { name: /Claude Code Anthropic's agentic coding CLI/ }).click();
  await expect(resolution).toHaveText(onClaude ?? "");
});

test("pipeline, model, and permission mode persist across a reload", async ({ page }) => {
  // Arrange — change all three, then close Setup.
  await page.goto("/");
  await openPipelineComposer(page);
  await page.getByRole("button", { name: "Product Manager + Developer + QA" }).click();
  await page.getByRole("option", { name: /Single agent/ }).click();

  await page.getByRole("button", { name: "Setup" }).click();
  await page.getByRole("button", { name: "AI Harness" }).click();
  await page.getByRole("button", { name: /Fast/ }).click();
  await page.getByRole("button", { name: /Accept edits only/ }).click();
  await page.getByRole("button", { name: "Close" }).click();

  // Act
  await page.reload();

  // Assert — the pipeline composer is where a stored pipeline is visible at all.
  await openPipelineComposer(page);
  await expect(page.getByText("What should the Agent build?")).toBeVisible();
  await expect(page.getByTestId("start-engine")).toHaveValue("claude-code");
  await expect(page.getByTestId("start-tier")).toHaveValue("fast");

  // Setup shows the stored preset and what it resolves to here
  await page.getByRole("button", { name: "Setup" }).click();
  await page.getByRole("button", { name: "AI Harness" }).click();
  await expect(page.getByText("→ haiku · effort low")).toBeVisible();

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

// Adopting a pre-preset settings file onto a tier is covered where the fixture can
// be honest — settings.comp.ts writes the file directly, with no `modelTier` in it.
// Through the API this is unreachable: resetting preferences stores one.
test("an exact model pinned in the advanced disclosure is what the composer reports", async ({ page }) => {
  // Arrange
  await page.goto("/");
  await writePreferences(page, { engineModels: { "claude-code": "claude-3-legacy" } });

  // Act
  await page.reload();

  // Assert — a pin the ladder does not cover is honoured verbatim, not rewritten.
  await openPipelineComposer(page);
  await page.getByRole("button", { name: DEFAULT_PIPELINE }).click();
  await page.getByRole("option", { name: /Single agent/ }).click();
  await expect(page.getByText(/Engine: Claude Code · claude-3-legacy/)).toBeVisible();
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

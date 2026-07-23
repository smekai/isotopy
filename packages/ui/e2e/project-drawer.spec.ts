import { expect, test } from "@playwright/test";

// The Project drawer is where a run's setup is visible now that the folder is
// no longer a per-run field. Only the home project is guaranteed to exist on a
// clean machine, so these assertions are about the drawer, not about which
// project happens to be active.

test("the Project button opens a drawer naming the active project's folder", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("open-project").click();

  await expect(page.getByTestId("project-drawer")).toBeVisible();
  await expect(page.getByTestId("project-root")).not.toBeEmpty();
  await expect(page.getByText("Runs and artifacts (git-ignored)")).toBeVisible();
});

test("the folder is stated, never editable", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("open-project").click();

  await expect(page.getByTestId("project-drawer").locator("input")).toHaveCount(0);
  await expect(page.getByTestId("project-drawer")).toContainText("folder");
});

test("the drawer summarises the engine and pipeline and links into Setup", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("open-project").click();

  const drawer = page.getByTestId("project-drawer");
  await expect(drawer).toContainText("Claude Code");
  await expect(drawer).toContainText("Never block");

  await drawer.getByRole("button", { name: /Edit in Setup/ }).nth(1).click();
  await expect(page.getByText("Pipeline Stages")).toBeVisible();
});

test("Escape closes the drawer", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("open-project").click();
  await expect(page.getByTestId("project-drawer")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByTestId("project-drawer")).toBeHidden();
});

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { resetPreferences } from "./support/preferences";

// The Project drawer is where a run's setup is visible now that the folder is
// no longer a per-run field. Only the home project is guaranteed to exist on a
// clean machine, so these assertions are about the drawer, not about which
// project happens to be active.

test.beforeEach(async ({ page }) => {
  await resetPreferences(page);
});

async function openDrawer(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByTestId("open-project").click();
}

test("the Project button opens a drawer naming the active project's folder", async ({ page }) => {
  // Act
  await openDrawer(page);

  // Assert
  await expect(page.getByTestId("project-drawer")).toBeVisible();
  await expect(page.getByTestId("project-root")).not.toBeEmpty();
  await expect(page.getByText("Runs and artifacts (git-ignored)")).toBeVisible();
});

test("the folder is stated, never editable", async ({ page }) => {
  // Act
  await openDrawer(page);

  // Assert
  await expect(page.getByTestId("project-drawer").locator("input")).toHaveCount(0);
  await expect(page.getByTestId("project-drawer")).toContainText("folder");
});

test("the drawer summarises the engine and permission mode", async ({ page }) => {
  // Act
  await openDrawer(page);

  // Assert
  const drawer = page.getByTestId("project-drawer");
  await expect(drawer).toContainText("Claude Code");
  await expect(drawer).toContainText("Never block");
});

test("the drawer links into the Setup section it summarises", async ({ page }) => {
  // Arrange
  await openDrawer(page);

  // Act
  await page
    .getByTestId("project-drawer")
    .getByRole("button", { name: /Edit in Setup/ })
    .nth(1)
    .click();

  // Assert
  await expect(page.getByText("Human Gates")).toBeVisible();
});

test("Escape closes the drawer", async ({ page }) => {
  // Arrange
  await openDrawer(page);
  await expect(page.getByTestId("project-drawer")).toBeVisible();

  // Act
  await page.keyboard.press("Escape");

  // Assert
  await expect(page.getByTestId("project-drawer")).toBeHidden();
});

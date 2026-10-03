import { expect, test } from "@playwright/test";
import path from "node:path";
import { resetPreferences } from "./support/preferences";
import { forgetProjectFolder, makeProjectFolder } from "./support/projects";

// The Project drawer is where a run's setup is visible now that the folder is
// no longer a per-run field. Only the home project is guaranteed to exist on a
// clean machine, so these assertions are about the drawer, not about which
// project happens to be active.

// Every test here is about the drawer, so opening it is shared arrangement.
test.beforeEach(async ({ page }) => {
  await resetPreferences(page);
  await page.goto("/");
  await page.getByTestId("open-project").click();
});

test("the Project button opens a drawer naming the active project's folder", async ({ page }) => {
  // Assert
  await expect(page.getByTestId("project-drawer")).toBeVisible();
  await expect(page.getByTestId("project-root")).not.toBeEmpty();
  await expect(page.getByText("Runs and artifacts (git-ignored)")).toBeVisible();
});

test("the folder is stated, never editable", async ({ page }) => {
  // Assert
  await expect(page.getByTestId("project-drawer").locator("input")).toHaveCount(0);
  await expect(page.getByTestId("project-drawer")).toContainText("folder");
});

test("the drawer summarises the engine and permission mode", async ({ page }) => {
  // Assert
  const drawer = page.getByTestId("project-drawer");
  await expect(drawer).toContainText("Claude Code");
  await expect(drawer).toContainText("Never block");
});

test("the drawer links into the Setup section it summarises", async ({ page }) => {
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
  await expect(page.getByTestId("project-drawer")).toBeVisible();

  // Act
  await page.keyboard.press("Escape");

  // Assert
  await expect(page.getByTestId("project-drawer")).toBeHidden();
});

test("the drawer's Add project opens the folder picker it tells a newcomer to use", async ({ page }) => {
  // Act
  await page.getByTestId("project-drawer").getByRole("button", { name: /Add project/ }).click();

  // Assert
  await expect(page.getByTestId("folder-picker")).toBeVisible();
  await expect(page.getByTestId("project-drawer")).toHaveCount(0);
});

test.describe("adding a real folder", () => {
  let folder: string;

  test.beforeEach(async () => {
    folder = await makeProjectFolder();
  });

  test.afterEach(async ({ page }) => {
    await forgetProjectFolder(page, folder);
  });

  test("a pasted folder path becomes the active project", async ({ page }) => {
    // Arrange
    await page.getByTestId("project-drawer").getByRole("button", { name: /Add project/ }).click();
    const field = page.getByLabel("Folder path");
    await field.fill(folder);
    await field.press("Enter");
    await expect(field).toHaveValue(path.resolve(folder));

    // Act
    await page.getByRole("button", { name: "Select this folder" }).click();

    // Assert
    await expect(page.getByTestId("project-switcher")).toHaveText(path.basename(folder));
  });
});

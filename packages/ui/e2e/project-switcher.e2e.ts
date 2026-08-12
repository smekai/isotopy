import { expect, test } from "@playwright/test";
import { resetPreferences } from "./support/preferences";

// Free tier: the switcher is driven against whatever the registry already
// holds. Only the home project is guaranteed to exist on a clean machine, so
// every assertion here is about the switcher itself — not about which projects
// happen to be registered. Cross-project isolation is proven server-side in
// packages/server/test/projects.comp.ts, where two projects can be created.

test.beforeEach(async ({ page }) => {
  await resetPreferences(page);
});

test("the header carries a real project switcher, not the old mock", async ({ page }) => {
  // Act
  await page.goto("/");

  // Assert
  await expect(page.getByText("my-saas-app")).toHaveCount(0);
  await expect(page.getByTestId("project-switcher")).toBeVisible();
});

test("the switcher lists the home project and offers to add one", async ({ page }) => {
  // Act
  await page.goto("/");
  await page.getByTestId("project-switcher").click();

  // Assert
  await expect(page.getByRole("listbox").getByRole("option").filter({ hasText: "Home" })).toBeVisible();
  await expect(page.getByText("Scratch runs outside any project")).toBeVisible();
  await expect(page.getByRole("button", { name: /Add project/ })).toBeVisible();
});

test("exactly one project is marked active at a time", async ({ page }) => {
  // Act
  await page.goto("/");
  await page.getByTestId("project-switcher").click();

  // Assert
  await expect(page.locator("[role=option][aria-selected=true]")).toHaveCount(1);
});

test("Escape closes the switcher", async ({ page }) => {
  // Arrange
  await page.goto("/");
  await page.getByTestId("project-switcher").click();
  await expect(page.getByRole("listbox").getByRole("option").first()).toBeVisible();

  // Act
  await page.keyboard.press("Escape");

  // Assert
  await expect(page.getByRole("listbox").getByRole("option")).toHaveCount(0);
});

test("Add project opens the folder picker", async ({ page }) => {
  // Arrange
  await page.goto("/");
  await page.getByTestId("project-switcher").click();

  // Act
  await page.getByRole("button", { name: /Add project/ }).click();

  // Assert
  await expect(page.getByTestId("folder-picker")).toBeVisible();
  await expect(page.getByRole("button", { name: /Select this folder/ })).toBeVisible();
});

test("Escape closes the folder picker", async ({ page }) => {
  // Arrange
  await page.goto("/");
  await page.getByTestId("project-switcher").click();
  await page.getByRole("button", { name: /Add project/ }).click();
  await expect(page.getByTestId("folder-picker")).toBeVisible();

  // Act
  await page.keyboard.press("Escape");

  // Assert
  await expect(page.getByTestId("folder-picker")).toHaveCount(0);
});

test("Setup names the active project", async ({ page }) => {
  // Arrange — open the list first: the trigger shows a placeholder until
  // /projects lands, and a selected option only exists once it has.
  await page.goto("/");
  await page.getByTestId("project-switcher").click();
  const active = await page.locator("[role=option][aria-selected=true]").innerText();
  await page.keyboard.press("Escape");

  // Act
  await page.getByRole("button", { name: "Setup" }).click();

  // Assert
  await expect(page.getByText("my-saas-app")).toHaveCount(0);
  const name = active.split("\n")[0]?.trim() ?? "";
  await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
});

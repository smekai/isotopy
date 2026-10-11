import { expect, test } from "@playwright/test";

// Free tier: Setup → Agents reads the real catalog through the `/agents` proxy.
// Starts no runs.

test("Setup → Agents lists the built-in team and the steps it can take", async ({ page }) => {
  // Arrange
  await page.goto("/");
  await page.getByRole("button", { name: "Setup" }).click();

  // Act
  await page.getByRole("button", { name: "Agents" }).click();

  // Assert
  await expect(page.getByTestId("agent-developer")).toContainText("Developer");
  await expect(page.getByTestId("agent-developer")).toContainText("BUILT IN");
  await expect(page.getByTestId("step-implement-feature")).toBeVisible();
  await expect(page.getByTestId("step-orchestrate")).toHaveCount(0);
});

test("a pack source the server refuses shows its reason in Setup → Agents", async ({ page }) => {
  // Arrange
  await page.goto("/");
  await page.getByRole("button", { name: "Setup" }).click();
  await page.getByRole("button", { name: "Agents" }).click();
  await page.getByLabel("Pack source").fill("http://example.test/pack.git");

  // Act
  await page.getByRole("button", { name: "Install" }).click();

  // Assert
  await expect(page.getByText(/Only https:\/\//)).toBeVisible();
});

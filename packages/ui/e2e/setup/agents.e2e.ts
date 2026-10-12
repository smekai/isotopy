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

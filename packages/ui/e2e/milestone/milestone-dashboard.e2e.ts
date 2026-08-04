// The e2e home is deliberately durable (settings persistence is itself under
// test), so seeded milestones survive between runs. Every locator here is keyed
// on the id the server just minted, never on a name that an earlier run may
// also have used.
import { expect, test } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";
import type { Milestone } from "@adhd/core";
import { resetPreferences } from "../support/preferences";

// Every test needs one seeded milestone, so it is created once per test rather
// than as the first line of each.
let milestone: Milestone;

test.beforeEach(async ({ page }) => {
  await resetPreferences(page);
  milestone = await createMilestone(page.request);
});

test("an active milestone reaches the rail with its progress count", async ({ page }) => {
  // Act
  await page.goto("/");

  // Assert
  const card = page.locator(`[data-milestone-id="${milestone.id}"]`);
  await card.scrollIntoViewIfNeeded();
  await expect(card).toBeVisible();
  await expect(card).toContainText("0/2");
});

test("opening a rail card navigates to that milestone's dashboard", async ({ page }) => {
  // Arrange
  await page.goto("/");
  const card = page.locator(`[data-milestone-id="${milestone.id}"]`);
  await card.scrollIntoViewIfNeeded();

  // Act
  await card.click();

  // Assert
  await expect(page).toHaveURL(new RegExp(`#/milestones/${milestone.id}$`));
  await expect(page.getByTestId("milestone-dashboard")).toBeVisible();
  await expect(page.getByTestId("milestone-progress")).toHaveText("0/2 features");
  await expect(page.getByTestId("milestone-feature")).toHaveCount(2);
  await expect(page.getByText("Milestone rail entry")).toBeVisible();
  await expect(page.getByText("TASK-093")).toBeVisible();
});

test("the autorun toggle flips when checked", async ({ page }) => {
  // Arrange
  await page.goto(`/#/milestones/${milestone.id}`);
  const toggle = page.getByTestId("milestone-autorun");
  await expect(toggle).not.toBeChecked();

  // Act
  await toggle.check();

  // Assert
  await expect(toggle).toBeChecked();
});

test("the autorun toggle is server state, so it survives a reload", async ({ page }) => {
  // Arrange
  await page.goto(`/#/milestones/${milestone.id}`);
  await page.getByTestId("milestone-autorun").check();
  await expect(page.getByTestId("milestone-autorun")).toBeChecked();

  // Act
  await page.reload();

  // Assert — a browser-only toggle would come back unchecked here.
  await expect(page.getByTestId("milestone-autorun")).toBeChecked();
});

test("Finalize stays disabled while features are unfinished", async ({ page }) => {
  // Act
  await page.goto(`/#/milestones/${milestone.id}`);

  // Assert
  await expect(page.getByTestId("milestone-finalize")).toBeDisabled();
  await expect(page.getByTestId("milestone-start-next")).toBeEnabled();
});

test("accepting the needs-attention feature is what unblocks Finalize", async ({ page }) => {
  // Arrange
  await markFirstFeatureNeedingAttention(page.request, milestone);
  await page.goto(`/#/milestones/${milestone.id}`);
  await expect(page.getByTestId("milestone-finalize")).toBeDisabled();

  // Act
  await page.getByTestId("milestone-feature-accept").click();

  // Assert
  await expect(page.getByTestId("milestone-feature-accept")).toHaveCount(0);
  await expect(page.getByTestId("milestone-progress")).toHaveText("2/2 features");
  await expect(page.getByTestId("milestone-finalize")).toBeEnabled();
});

test("an acceptance is recorded on the server, so it survives a reload", async ({ page }) => {
  // Arrange
  await markFirstFeatureNeedingAttention(page.request, milestone);
  await page.goto(`/#/milestones/${milestone.id}`);
  await page.getByTestId("milestone-feature-accept").click();
  await expect(page.getByTestId("milestone-feature-accept")).toHaveCount(0);

  // Act
  await page.reload();

  // Assert
  await expect(page.getByText(/^Accepted /)).toBeVisible();
});

test("the milestone route is a sibling of home, so the composer is untouched", async ({
  page,
}) => {
  // Arrange
  await page.goto(`/#/milestones/${milestone.id}`);
  await expect(page.getByTestId("milestone-dashboard")).toBeVisible();

  // Act
  await page.getByRole("button", { name: "New run" }).click();

  // Assert
  await expect(page.getByPlaceholder("Describe the task...")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Product Manager + Developer + QA" }),
  ).toBeVisible();
  await expect(page.getByTestId("milestone-dashboard")).toHaveCount(0);
});

async function createMilestone(request: APIRequestContext): Promise<Milestone> {
  const response = await request.post("/milestones", {
    data: {
      name: `Dashboard spec ${Date.now()}`,
      goal: "Prove the dashboard renders",
      status: "active",
      features: [
        {
          title: "Milestone rail entry",
          description: "The rail lists active milestones",
          acceptanceCriteria: ["Shows a progress count"],
          taskIds: ["TASK-093"],
        },
        { title: "Autorun toggle" },
      ],
    },
  });
  return (await response.json()) as Milestone;
}

/**
 * Drive a seeded milestone to the one state Finalize cares about: every feature
 * settled except the first, which needs attention.
 */
async function markFirstFeatureNeedingAttention(
  request: APIRequestContext,
  milestone: Milestone,
): Promise<void> {
  const [first, ...rest] = milestone.features;
  const patches = [
    ...(first ? [[first.id, "needs_attention"] as const] : []),
    ...rest.map((feature) => [feature.id, "completed"] as const),
  ];
  await Promise.all(
    patches.map(([id, status]) =>
      request.patch(`/milestones/${milestone.id}/features/${id}`, { data: { status } }),
    ),
  );
}

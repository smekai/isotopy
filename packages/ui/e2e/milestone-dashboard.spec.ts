// Free tier of docs/e2e-test-plan.md: the milestone dashboard against a real
// server, with the milestone seeded through the API rather than planned by an
// agent — no engine spend, no run started. What only a browser can prove is
// that the rail entry, the hash route and the server-persisted autorun toggle
// line up, which the component suite mocks away.
//
// The e2e home is deliberately durable (settings persistence is itself under
// test), so seeded milestones survive between runs. Every locator here is keyed
// on the id the server just minted, never on a name that an earlier run may
// also have used.
import { expect, test } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";
import type { Milestone } from "@adhd/core";
import { resetPreferences } from "./support/preferences";

async function seedMilestone(request: APIRequestContext): Promise<Milestone> {
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

test.beforeEach(async ({ page }) => {
  await resetPreferences(page);
});

test("an active milestone reaches the rail and opens its dashboard", async ({ page }) => {
  const milestone = await seedMilestone(page.request);

  await page.goto("/");

  const card = page.locator(`[data-milestone-id="${milestone.id}"]`);
  await card.scrollIntoViewIfNeeded();
  await expect(card).toBeVisible();
  await expect(card).toContainText("0/2");

  await card.click();

  await expect(page).toHaveURL(new RegExp(`#/milestones/${milestone.id}$`));
  await expect(page.getByTestId("milestone-dashboard")).toBeVisible();
  await expect(page.getByTestId("milestone-progress")).toHaveText("0/2 features");
  await expect(page.getByTestId("milestone-feature")).toHaveCount(2);
  await expect(page.getByText("Milestone rail entry")).toBeVisible();
  await expect(page.getByText("TASK-093")).toBeVisible();
});

test("the autorun toggle is server state, so it survives a reload", async ({ page }) => {
  const milestone = await seedMilestone(page.request);

  await page.goto(`/#/milestones/${milestone.id}`);
  const toggle = page.getByTestId("milestone-autorun");
  await expect(toggle).not.toBeChecked();

  await toggle.check();
  await expect(toggle).toBeChecked();

  await page.reload();
  await expect(page.getByTestId("milestone-autorun")).toBeChecked();
});

test("Finalize stays disabled while features are unfinished", async ({ page }) => {
  const milestone = await seedMilestone(page.request);

  await page.goto(`/#/milestones/${milestone.id}`);

  await expect(page.getByTestId("milestone-finalize")).toBeDisabled();
  await expect(page.getByTestId("milestone-start-next")).toBeEnabled();
});

test("the milestone route is a sibling of home, so the composer is untouched", async ({
  page,
}) => {
  const milestone = await seedMilestone(page.request);

  await page.goto(`/#/milestones/${milestone.id}`);
  await expect(page.getByTestId("milestone-dashboard")).toBeVisible();

  await page.getByRole("button", { name: "New run" }).click();

  await expect(page.getByPlaceholder("Describe the task...")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Product Manager + Developer + QA" }),
  ).toBeVisible();
  await expect(page.getByTestId("milestone-dashboard")).toHaveCount(0);
});

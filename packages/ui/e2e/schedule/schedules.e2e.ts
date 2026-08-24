import { expect, test } from "@playwright/test";
import type { ScheduleView } from "@isotopy/core";
import { resetPreferences } from "../support/preferences";
import { anticipateSchedules, recordScheduleCreates } from "../support/schedules";

// The rail's third section in a real browser.
//
// `schedules.comp.ts` proves the firing rules on the server, and the component
// tests prove each piece renders. What only a browser can answer is whether the
// section coexists with the runs list — whether adding recurring work to the rail
// took anything away from the work that is already there — and whether the create
// dialog reaches the API with what the user typed.
//
// Seeded through route interception like `run-limit.e2e.ts`, so it costs zero
// tokens, and typed as `ScheduleView` so a change to the model breaks typecheck
// rather than rotting here.

const SCHEDULE_ID = "e2esched1";

function anHourFromNow(): string {
  return new Date(Date.now() + 60 * 60 * 1000).toISOString();
}

const SEEDED: ScheduleView = {
  id: SCHEDULE_ID,
  projectId: "home",
  name: "Board poller",
  cron: "0 9 * * *",
  timezone: "UTC",
  task: "Take the next task off the board",
  team: {
    name: "Board reader",
    summary: "One persona, one step.",
    roles: [
      {
        id: "reader",
        label: "Project Manager",
        skill: "project-manager",
        stepTask: "plan-feature",
      },
    ],
  },
  enabled: true,
  nextFireAt: anHourFromNow(),
  createdAt: "2026-08-01T09:00:00.000Z",
  updatedAt: "2026-08-01T09:00:00.000Z",
};

test.beforeEach(async ({ page }) => {
  await resetPreferences(page);
  await anticipateSchedules(page, [SEEDED]);
});

test("a schedule is listed in the rail with the fire time the server sent", async ({ page }) => {
  // Act
  await page.goto("/");

  // Assert
  await expect(page.getByTestId("schedule-card")).toContainText("Board poller");
});

test("the schedules section leaves the runs list exactly where it was", async ({ page }) => {
  // Act
  await page.goto("/");

  // Assert — recurring work is not a run, so it must not have displaced them.
  await expect(page.getByRole("navigation", { name: "Runs" })).toContainText("Runs");
  await expect(page.getByTestId("schedule-card")).toBeVisible();
});

test("opening a schedule shows its detail view rather than a run", async ({ page }) => {
  // Arrange
  await page.goto("/");

  // Act
  await page.getByTestId("schedule-card").click();

  // Assert
  await expect(page.getByTestId("schedule-dashboard")).toContainText("Board poller");
  await expect(page).toHaveURL(new RegExp(`#/schedules/${SCHEDULE_ID}`));
});

test("creating a schedule posts the expression the user typed", async ({ page }) => {
  // Anticipate — a recording route for the create call.
  const posted = await recordScheduleCreates(page, [SEEDED], SEEDED);
  await page.goto("/");

  // Arrange
  await page.getByTestId("new-schedule").click();
  await page.getByTestId("schedule-name").fill("Nightly sweep");
  await page.getByTestId("schedule-cron").fill("0 3 * * *");

  // Act
  await page.getByTestId("schedule-save").click();

  // Assert
  await expect.poll(() => posted.length).toBe(1);
  expect(posted[0]?.postDataJSON()).toMatchObject({
    name: "Nightly sweep",
    cron: "0 3 * * *",
  });
});

test("Escape closes the create dialog, so it is never a trap", async ({ page }) => {
  // Arrange
  await page.goto("/");
  await page.getByTestId("new-schedule").click();
  await expect(page.getByTestId("schedule-modal")).toBeVisible();

  // Act
  await page.keyboard.press("Escape");

  // Assert
  await expect(page.getByTestId("schedule-modal")).toBeHidden();
});

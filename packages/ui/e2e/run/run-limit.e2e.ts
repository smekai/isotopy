import { expect, test } from "@playwright/test";
import type { Page, Request } from "@playwright/test";
import type { RunLimit, RunState } from "@adhd/core";
import { LIMIT_COPY } from "../../src/limit-copy";
import { resetPreferences } from "../support/preferences";

// The plan-limit popup, without burning a real subscription limit to see it.
//
// The server proves the park, the durable resume and the model switch in
// `limit-pause.comp.ts`. What that cannot reach is the reason the popup exists:
// nobody is watching. The browser contract is that a parked run announces itself
// over the run view, states when it comes back *in the reader's own timezone*,
// and that each way out posts the right payload — resuming on the wrong model
// spends money silently.
//
// Seeded through route interception like `run-question.spec.ts`, so it costs zero
// tokens, and typed as `RunState` so a change to the run model breaks typecheck
// rather than rotting here.

// the blocked run every test here reads is anticipated once. A route a single
// test needs is still registered in its body: Playwright matches the most
// recently registered route first, so it wins over this one.
test.beforeEach(async ({ page }) => {
  await resetPreferences(page);
  await anticipateBlockedRun(page);
});

const RUN_ID = "e2elimit1";

const RAW_LIMIT = "You've hit your session limit · resets 4:30pm (Europe/Tallinn)";

const STARTED_AT = "2026-07-27T09:00:00.000Z";
const DETECTED_AT = "2026-07-27T09:00:20.000Z";
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

/** Relative to the wall clock the browser actually has, or the countdown reads zero. */
function resetTwoHoursFromNow(): string {
  return new Date(Date.now() + TWO_HOURS_MS).toISOString();
}

const LIMIT: RunLimit = {
  stageId: "implementation",
  engine: "claude-code",
  model: "opus",
  raw: RAW_LIMIT,
  resetAt: resetTwoHoursFromNow(),
  detectedAt: DETECTED_AT,
  attempt: 1,
};

const BLOCKED_RUN: RunState = {
  id: RUN_ID,
  number: 9201,
  projectId: "home",
  pipelineId: "pm-dev-test",
  pipelineName: "Product Manager + Developer + QA",
  status: "blocked",
  task: "seeded plan limit",
  engine: "claude-code",
  model: "opus",
  workspacePath: "/seeded/workspace",
  messages: [],
  createdAt: STARTED_AT,
  limit: LIMIT,
  stages: [
    {
      id: "intake",
      label: "Project Manager",
      skill: "project-manager",
      status: "passed",
      startedAt: STARTED_AT,
      completedAt: "2026-07-27T09:00:10.000Z",
      logs: [],
    },
    {
      id: "implementation",
      label: "Developer",
      skill: "developer",
      status: "blocked",
      startedAt: "2026-07-27T09:00:10.000Z",
      logs: [
        {
          ts: DETECTED_AT,
          level: "warn",
          message: "Developer hit a plan limit — waiting 2h 0m for the reset",
        },
      ],
    },
    { id: "test", label: "QA Engineer", skill: "tester", status: "pending", logs: [] },
  ],
};

test("a parked run announces the limit over the run, with the raw line behind it", async ({
  page,
}) => {
  // Act
  await openBlockedRun(page);

  // Assert
  const modal = page.getByTestId("limit-modal");
  await expect(modal).toContainText(LIMIT_COPY.headline(LIMIT));
  // The raw CLI line stays visible so the parsed reset can be checked against it.
  await expect(modal).toContainText("resets 4:30pm (Europe/Tallinn)");
});

test("the countdown ticks down rather than showing a frozen timestamp", async ({ page }) => {
  // Act
  await openBlockedRun(page);

  // Assert — a frozen timestamp would look identical on first render.
  const countdown = page.getByTestId("limit-countdown");
  const first = await countdown.textContent();
  await expect(countdown).not.toHaveText(first ?? "", { timeout: 5_000 });
});

test("the rail shows BLOCKED so a parked run is visible without opening it", async ({ page }) => {
  // Act
  await openBlockedRun(page);

  // Assert
  await expect(
    page.getByTestId("run-card").filter({ hasText: "seeded plan limit" }),
  ).toContainText("BLOCKED");
});

test("choosing a cheaper model posts that model to the resolve endpoint", async ({ page }) => {
  // Anticipate — the seeded run, plus a recording route for the resolve call.

  const posted: Request[] = [];
  await page.route(
    (url) => url.pathname === `/runs/${RUN_ID}/limit/implementation/resolve`,
    (route) => {
      posted.push(route.request());
      return route.fulfill({ json: { ...BLOCKED_RUN, status: "running" } });
    },
  );

  // Arrange
  await openBlockedRun(page);

  // Act
  await page.getByRole("button", { name: /Haiku/ }).click();

  // Assert
  await expect.poll(() => posted.length).toBe(1);
  expect(posted[0]?.method()).toBe("POST");
  expect(posted[0]?.postDataJSON()).toEqual({ choice: "switch-model", model: "haiku" });
});

test("Escape dismisses the popup and leaves the run parked, not resolved", async ({ page }) => {
  // Anticipate — any limit call at all would be a bug, so record every one.

  const posted: Request[] = [];
  await page.route(
    (url) => url.pathname.includes("/limit/"),
    (route) => {
      posted.push(route.request());
      return route.fulfill({ json: BLOCKED_RUN });
    },
  );

  // Arrange
  await openBlockedRun(page);

  // Act
  await page.keyboard.press("Escape");

  // Assert — dismissing is not resolving; the run must stay parked.
  await expect(page.getByTestId("limit-modal")).toBeHidden();
  await expect(page.getByTestId("run-status")).toHaveText("BLOCKED");
  expect(posted).toHaveLength(0);
});

test("a parked run can still be aborted from the bottom bar", async ({ page }) => {
  // Arrange
  await openBlockedRun(page);

  // Act
  await page.keyboard.press("Escape");

  // Assert
  await expect(page.getByRole("button", { name: "Abort" })).toBeVisible();
});

async function anticipateBlockedRun(page: Page): Promise<void> {
  await page.route(
    (url) => url.pathname === "/runs",
    (route) => route.fulfill({ json: [BLOCKED_RUN] }),
  );
  await page.route(
    (url) => url.pathname === `/runs/${RUN_ID}`,
    (route) => route.fulfill({ json: BLOCKED_RUN }),
  );
  // Not terminal, so the app holds both streams open for the length of the wait.
  await page.route(
    (url) => url.pathname === `/runs/${RUN_ID}/events`,
    (route) => route.fulfill({ contentType: "text/event-stream", body: "" }),
  );
  await page.route(
    (url) => url.pathname === "/runs/events",
    (route) => route.fulfill({ contentType: "text/event-stream", body: "" }),
  );
}

async function openBlockedRun(page: Page): Promise<void> {
  await page.goto(`/#/runs/${RUN_ID}`);
  await expect(page.getByTestId("limit-modal")).toBeVisible();
}

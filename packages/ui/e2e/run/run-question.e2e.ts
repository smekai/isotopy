import { expect, test } from "@playwright/test";
import type { Page, Request } from "@playwright/test";
import type { RunState } from "@adhd/core";
import { resetPreferences } from "../support/preferences";

// The parked-question half of the conversational loop, without running an engine.
//
// The server proves the park, the resume and the session reuse in
// `run-questions.comp.ts`. What that cannot reach is the browser contract the
// feature is actually delivered through: a question that reads as a question,
// a composer that says it wants an answer, `ASKING` in the rail, and the typed
// answer arriving at `POST /runs/:id/messages`. Those four were verified by hand
// when TASK-079 landed and had nothing guarding them since.
//
// Seeded through route interception like `dev-test-flow.spec.ts`, so it costs
// zero tokens, and typed as `RunState` so a change to the run model breaks
// typecheck rather than rotting here.

// the parked run every test here reads is anticipated once. A route a single
// test needs is still registered in its body: Playwright matches the most
// recently registered route first, so it wins over this one.
test.beforeEach(async ({ page }) => {
  await resetPreferences(page);
  await anticipateAskingRun(page);
});

const RUN_ID = "e2eask01";

const QUESTION =
  "Should the export run against the live table or a nightly snapshot?";
const ANSWER = "Use the nightly snapshot.";

const STARTED_AT = "2026-07-27T09:00:00.000Z";
const ASKED_AT = "2026-07-27T09:00:20.000Z";

test("a parked question reads as a question, not as ordinary narration", async ({ page }) => {
  // Act
  await openAskingRun(page);

  // Assert — the question is its own block, so it cannot be mistaken for the
  // narration above it; that distinction is why `kind: "question"` exists.
  const question = page.getByTestId("chat-question");
  await expect(question).toHaveText(QUESTION);

  // It sits in the one thread, after the box's own narration and tool row.
  const thread = page.getByTestId("chat-thread");
  await expect(thread).toContainText("Project Manager online");
  const order = await thread.innerText();
  expect(order.indexOf("Project Manager online")).toBeLessThan(order.indexOf(QUESTION));
  expect(order.indexOf("Read package.json")).toBeLessThan(order.indexOf(QUESTION));
});

test("the composer asks for an answer and already has focus", async ({ page }) => {
  // Act
  await openAskingRun(page);

  // Assert — a parked run is waiting on this one control, so it takes focus
  // itself; the user should be able to answer without reaching for the mouse.
  const composer = page.getByTestId("chat-composer");
  await expect(composer).toHaveAttribute("placeholder", "Answer the question…");
  await expect(composer).toBeFocused();
});

test("the rail shows the run as ASKING so a parked run is visible from anywhere", async ({
  page,
}) => {
  // Act
  await openAskingRun(page);

  // Assert — the point of the rail is that a run parked on a question is
  // discoverable without opening it; the user is not watching this tab.
  await expect(
    page.getByTestId("run-card").filter({ hasText: "seeded parked question" }),
  ).toContainText("ASKING");
});

test("the typed answer is posted to the run's message endpoint", async ({ page }) => {
  // Anticipate — the seeded run, plus a recording route for the answer itself.

  const posted: Request[] = [];
  await page.route(
    (url) => url.pathname === `/runs/${RUN_ID}/messages`,
    (route) => {
      posted.push(route.request());
      return route.fulfill({
        status: 201,
        json: { id: "a1", ts: ASKED_AT, role: "user", stageId: "intake", kind: "answer", text: ANSWER },
      });
    },
  );

  // Arrange
  await openAskingRun(page);
  await page.getByTestId("chat-composer").fill(ANSWER);

  // Act
  await page.keyboard.press("Enter");

  // Assert — Enter sends; the server turns this into the resume signal.
  await expect.poll(() => posted.length).toBe(1);
  expect(posted[0]?.method()).toBe("POST");
  expect(posted[0]?.postDataJSON()).toEqual({ text: ANSWER });

  // The composer clears, so a second answer cannot be sent by accident.
  await expect(page.getByTestId("chat-composer")).toHaveValue("");
});

/**
 * A Project Manager parked mid-stage, exactly as `stageAsking` leaves it: the
 * question is an agent message with `kind: "question"`, and both the stage and
 * the run carry `asking` — the run status is what the composer keys off.
 */
const ASKING_RUN: RunState = {
  id: RUN_ID,
  number: 9101,
  projectId: "home",
  pipelineId: "pm-dev-test",
  pipelineName: "Product Manager + Developer + QA",
  status: "asking",
  task: "seeded parked question",
  engine: "claude-code",
  model: "haiku",
  workspacePath: "/seeded/workspace",
  messages: [
    {
      id: "q1",
      ts: ASKED_AT,
      role: "agent",
      stageId: "intake",
      kind: "question",
      text: QUESTION,
    },
  ],
  createdAt: STARTED_AT,
  stages: [
    {
      id: "intake",
      label: "Scoping",
      skill: "project-manager",
      status: "asking",
      startedAt: STARTED_AT,
      logs: [
        {
          ts: STARTED_AT,
          level: "info",
          message: "Project Manager online · Claude Code · haiku",
        },
        {
          ts: "2026-07-27T09:00:10.000Z",
          level: "run",
          message: "Read package.json",
          activity: { kind: "tool", name: "Read", detail: "package.json" },
        },
      ],
    },
    { id: "implementation", label: "Implementing", skill: "developer", status: "pending", logs: [] },
    { id: "test", label: "Verifying", skill: "tester", status: "pending", logs: [] },
  ],
};

/**
 * Serve the parked run. The run is *not* terminal, so the app holds the event
 * stream open — an empty `text/event-stream` body is enough to satisfy it
 * without pushing anything the assertions do not need.
 */
async function anticipateAskingRun(page: Page): Promise<void> {
  await page.route(
    (url) => url.pathname === "/runs",
    (route) => route.fulfill({ json: [ASKING_RUN] }),
  );
  await page.route(
    (url) => url.pathname === `/runs/${RUN_ID}`,
    (route) => route.fulfill({ json: ASKING_RUN }),
  );
  await page.route(
    (url) => url.pathname === `/runs/${RUN_ID}/events`,
    (route) => route.fulfill({ contentType: "text/event-stream", body: "" }),
  );
  await page.route(
    (url) => url.pathname === "/runs/events",
    (route) => route.fulfill({ contentType: "text/event-stream", body: "" }),
  );
}

async function openAskingRun(page: Page): Promise<void> {
  await page.goto(`/#/runs/${RUN_ID}`);
  await expect(page.getByTestId("run-status")).toHaveText("ASKING");
}

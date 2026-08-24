// TASK-142's dogfood attempted verification three times over 1h 58m and got no
// verdict any of them, because each retry began from nothing: the stage's Cursor
// session was discarded, so attempt two reinstalled the browser attempt one had
// already installed. These cover the rule that decides whether a restart resumes.
import { expect, test } from "vitest";
import type { StageState } from "@isotopy/core";
import { resumableSession } from "../../src/domain/rules/run-seeding.ts";
import { buildResumePrompt, buildTimeBudget } from "../../src/domain/markdown/stage.ts";

const SESSION = "d0280d10-d76c-4703-a0ce-0ab42acdc2be";

function stage(overrides: Partial<StageState> = {}): StageState {
  return { id: "verifying", label: "Verifying", status: "failed", logs: [], ...overrides };
}

test("a stage cut off before any verdict resumes the session it left behind", () => {
  expect(resumableSession(stage({ sessionId: SESSION }), "cursor")).toBe(SESSION);
});

test("a stage that reached a verdict starts fresh, because it finished its thought", () => {
  // A FAIL is an answer. Resuming it would continue a conversation that ended.
  expect(resumableSession(stage({ sessionId: SESSION, verdict: "FAIL" }), "cursor")).toBeUndefined();
});

test("a stage with no session recorded has nothing to resume", () => {
  expect(resumableSession(stage(), "cursor")).toBeUndefined();
});

test("a session is never handed to an engine that cannot resume one", () => {
  // The catalog is what answers this, so a new engine cannot inherit the claim.
  expect(resumableSession(stage({ sessionId: SESSION }), undefined)).toBeUndefined();
});

test("a resumed turn is told it was cut off, rather than being handed an empty prompt", () => {
  const prompt = buildResumePrompt(undefined);

  expect(prompt).toContain("cut off");
  expect(prompt).toContain("do not start the stage over");
});

test("the time budget names the minutes and what overrunning costs", () => {
  const budget = buildTimeBudget(600_000);

  expect(budget).toContain("10 minutes");
  expect(budget).toContain("no verdict at all");
});

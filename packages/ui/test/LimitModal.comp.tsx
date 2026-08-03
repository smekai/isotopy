// Component test: the limit popup is the only surface between an unattended run
// and a user who does not know it stopped. Every button here spends money or
// changes which harness the rest of the run uses, so a mis-wired payload is not
// a cosmetic bug — it silently resumes on the wrong model.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { LimitResolution } from "@adhd/core";
import { LimitModal } from "../src/components/LimitModal";
import { LIMIT_COPY } from "../src/limit-copy";
import { DIRS } from "../src/theme";
import { limit, run, stage } from "./support/run-fixtures";

const d = DIRS.indigo;

const BLOCKED_RUN = run([stage("design", "blocked")], "blocked");

interface Handlers {
  onResolve: (resolution: LimitResolution) => void;
  onAbort: () => void;
  onOpenConnection: () => void;
  onDismiss: () => void;
}

function handlers(): Handlers {
  return {
    onResolve: vi.fn(),
    onAbort: vi.fn(),
    onOpenConnection: vi.fn(),
    onDismiss: vi.fn(),
  };
}

function show(spies: Handlers, overrides = {}) {
  return render(<LimitModal d={d} run={BLOCKED_RUN} limit={limit(overrides)} {...spies} />);
}

beforeEach(() => {
  vi.stubGlobal("Notification", undefined);
  vi.setSystemTime(new Date("2026-07-21T12:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  cleanup();
});

test("the countdown says how long is left, not just that something is wrong", () => {
  show(handlers());

  expect(screen.getByTestId("limit-countdown").textContent).toBe("1h 30m 00s");
});

test("a limit with no parsed reset time says so instead of showing a blank countdown", () => {
  show(handlers(), { resetAt: undefined });

  expect(screen.queryByTestId("limit-countdown")).toBeNull();
  expect(screen.getByText(LIMIT_COPY.noResetTime)).toBeTruthy();
});

test("the raw harness line is shown so the parsed reset can be checked against it", () => {
  show(handlers(), { raw: "You've hit your session limit · resets 4:30pm (Europe/Tallinn)" });

  expect(screen.getByText(/resets 4:30pm \(Europe\/Tallinn\)/)).toBeTruthy();
});

test("picking a cheaper model resolves with that model id", () => {
  const spies = handlers();
  show(spies);

  fireEvent.click(screen.getByText("Haiku"));

  expect(spies.onResolve).toHaveBeenCalledWith({ choice: "switch-model", model: "haiku" });
});

test("the model already in use is not offered as a way out of its own limit", () => {
  show(handlers(), { model: "opus" });

  expect(screen.queryByText("Opus")).toBeNull();
});

test("a model that bills usage credits is not offered as an escape from a plan limit", () => {
  show(handlers());

  // Sonnet · 1M context costs more, not less — it cannot resolve a plan limit.
  expect(screen.queryByText(/1M context/)).toBeNull();
});

test("switching harness names the engine and leaves the model to the new harness", () => {
  const spies = handlers();
  show(spies);

  fireEvent.click(screen.getByText("Codex"));

  expect(spies.onResolve).toHaveBeenCalledWith({ choice: "switch-engine", engine: "codex" });
});

test("retry now resolves without changing any setting", () => {
  const spies = handlers();
  show(spies);

  fireEvent.click(screen.getByText(LIMIT_COPY.retryNow));

  expect(spies.onResolve).toHaveBeenCalledWith({ choice: "retry-now" });
});

test("keeping the wait dismisses the popup without resolving the run", () => {
  const spies = handlers();
  show(spies);

  fireEvent.click(screen.getByText(LIMIT_COPY.keepWaiting));

  expect(spies.onDismiss).toHaveBeenCalled();
  expect(spies.onResolve).not.toHaveBeenCalled();
});

test("Escape dismisses rather than resolving, so the run keeps waiting", () => {
  const spies = handlers();
  show(spies);

  fireEvent.keyDown(document, { key: "Escape" });

  expect(spies.onDismiss).toHaveBeenCalled();
  expect(spies.onResolve).not.toHaveBeenCalled();
});

test("the dialog announces itself as modal so a screen reader traps into it", () => {
  show(handlers());

  expect(screen.getByTestId("limit-modal").getAttribute("aria-modal")).toBe("true");
});

test("a browser without the Notification API hides the enable-notifications offer", () => {
  show(handlers());

  expect(screen.queryByText(LIMIT_COPY.enableNotifications)).toBeNull();
});

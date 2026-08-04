// Component test: the limit popup is the only surface between an unattended run
// and a user who does not know it stopped. Every button here spends money or
// changes which harness the rest of the run uses, so a mis-wired payload is not
// a cosmetic bug — it silently resumes on the wrong model.
//
// The component's whole outward effect is which callback it invokes with what,
// so the spies live on the generated props and a test names the one it asserts on.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { LimitModal } from "../../src/components/LimitModal";
import type { LimitModalProps } from "../../src/components/LimitModal";
import { LIMIT_COPY } from "../../src/limit-copy";
import { DIRS } from "../../src/theme";
import { limit, run, stage } from "../support/run-fixtures";

const RAW_LINE = "You've hit your session limit · resets 4:30pm (Europe/Tallinn)";

function limitProps(overrides: Partial<LimitModalProps> = {}): LimitModalProps {
  return {
    d: DIRS.indigo,
    run: run([stage("design", "blocked")], "blocked"),
    limit: limit(),
    onResolve: vi.fn(),
    onAbort: vi.fn(),
    onOpenConnection: vi.fn(),
    onDismiss: vi.fn(),
    ...overrides,
  };
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
  // Act
  render(<LimitModal {...limitProps()} />);

  // Assert
  expect(screen.getByTestId("limit-countdown").textContent).toBe("1h 30m 00s");
});

test("a limit with no parsed reset time says so instead of showing a blank countdown", () => {
  // Act
  render(<LimitModal {...limitProps({ limit: limit({ resetAt: undefined }) })} />);

  // Assert
  expect(screen.queryByTestId("limit-countdown")).toBeNull();
  expect(screen.getByText(LIMIT_COPY.noResetTime)).toBeTruthy();
});

test("the raw harness line is shown so the parsed reset can be checked against it", () => {
  // Act
  render(<LimitModal {...limitProps({ limit: limit({ raw: RAW_LINE }) })} />);

  // Assert
  expect(screen.getByText(/resets 4:30pm \(Europe\/Tallinn\)/)).toBeTruthy();
});

test("picking a cheaper model resolves with that model id", () => {
  // Arrange
  const props = limitProps();
  render(<LimitModal {...props} />);

  // Act
  fireEvent.click(screen.getByText("Haiku"));

  // Assert
  expect(props.onResolve).toHaveBeenCalledWith({ choice: "switch-model", model: "haiku" });
});

test("the model already in use is not offered as a way out of its own limit", () => {
  // Act
  render(<LimitModal {...limitProps({ limit: limit({ model: "opus" }) })} />);

  // Assert
  expect(screen.queryByText("Opus")).toBeNull();
});

test("a model that bills usage credits is not offered as an escape from a plan limit", () => {
  // Act
  render(<LimitModal {...limitProps()} />);

  // Assert — Sonnet · 1M context costs more, not less; it cannot resolve a plan limit.
  expect(screen.queryByText(/1M context/)).toBeNull();
});

test("switching harness names the engine and leaves the model to the new harness", () => {
  // Arrange
  const props = limitProps();
  render(<LimitModal {...props} />);

  // Act
  fireEvent.click(screen.getByText("Codex"));

  // Assert
  expect(props.onResolve).toHaveBeenCalledWith({ choice: "switch-engine", engine: "codex" });
});

test("retry now resolves without changing any setting", () => {
  // Arrange
  const props = limitProps();
  render(<LimitModal {...props} />);

  // Act
  fireEvent.click(screen.getByText(LIMIT_COPY.retryNow));

  // Assert
  expect(props.onResolve).toHaveBeenCalledWith({ choice: "retry-now" });
});

test("keeping the wait dismisses the popup without resolving the run", () => {
  // Arrange
  const props = limitProps();
  render(<LimitModal {...props} />);

  // Act
  fireEvent.click(screen.getByText(LIMIT_COPY.keepWaiting));

  // Assert
  expect(props.onDismiss).toHaveBeenCalled();
  expect(props.onResolve).not.toHaveBeenCalled();
});

test("Escape dismisses rather than resolving, so the run keeps waiting", () => {
  // Arrange
  const props = limitProps();
  render(<LimitModal {...props} />);

  // Act
  fireEvent.keyDown(document, { key: "Escape" });

  // Assert
  expect(props.onDismiss).toHaveBeenCalled();
  expect(props.onResolve).not.toHaveBeenCalled();
});

test("the dialog announces itself as modal so a screen reader traps into it", () => {
  // Act
  render(<LimitModal {...limitProps()} />);

  // Assert
  expect(screen.getByTestId("limit-modal").getAttribute("aria-modal")).toBe("true");
});

test("a browser without the Notification API hides the enable-notifications offer", () => {
  // Act
  render(<LimitModal {...limitProps()} />);

  // Assert
  expect(screen.queryByText(LIMIT_COPY.enableNotifications)).toBeNull();
});

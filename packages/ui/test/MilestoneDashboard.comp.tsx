// Component test: the dashboard is where a milestone's state becomes actions a
// user can take. Every control here either spends money (Start next), closes a
// milestone out (Finalize), or overrides a blocking finding (Accept) — so what
// matters is that each one is dead when it should be, and reports the right id
// when it fires.
//
// Anticipate is the handler bag returned by `renderDashboard`: the component's
// whole outward effect is which callback it invokes with what.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import type { Milestone, RunSummary } from "@adhd/core";
import { MilestoneDashboard } from "../src/components/MilestoneDashboard";
import { DIRS } from "../src/theme";
import { feature, featureRun, finding, milestone } from "./support/milestone-fixtures";

const d = DIRS.indigo;

interface Handlers {
  onToggleAutoRun: ReturnType<typeof vi.fn>;
  onStartNext: ReturnType<typeof vi.fn>;
  onFinalize: ReturnType<typeof vi.fn>;
  onOpenRun: ReturnType<typeof vi.fn>;
  onAcceptFeature: ReturnType<typeof vi.fn>;
}

function renderDashboard(
  value: Milestone,
  runs: RunSummary[] = [],
  busy = false,
): Handlers {
  const handlers: Handlers = {
    onToggleAutoRun: vi.fn(),
    onStartNext: vi.fn(),
    onFinalize: vi.fn(),
    onOpenRun: vi.fn(),
    onAcceptFeature: vi.fn(),
  };
  render(
    <MilestoneDashboard milestone={value} runs={runs} busy={busy} d={d} {...handlers} />,
  );
  return handlers;
}

function control(testId: string): HTMLButtonElement | HTMLInputElement {
  return screen.getByTestId(testId) as HTMLButtonElement | HTMLInputElement;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

test("progress counts completed features against the total", () => {
  // Act
  renderDashboard(
    milestone([
      feature("f1", "completed"),
      feature("f2", "needs_attention"),
      feature("f3", "ready"),
    ]),
  );

  // Assert
  expect(screen.getByTestId("milestone-progress").textContent).toBe("1/3 features");
});

test("Start next reports the request while a feature is ready", () => {
  // Arrange
  const handlers = renderDashboard(milestone([feature("f1", "ready")]));
  expect(control("milestone-start-next").disabled).toBe(false);

  // Act
  fireEvent.click(control("milestone-start-next"));

  // Assert
  expect(handlers.onStartNext).toHaveBeenCalledOnce();
});

test("Start next is dead once a feature is already running", () => {
  // Act
  renderDashboard(milestone([feature("f1", "in_progress"), feature("f2", "ready")]));

  // Assert — a second run on the same milestone is paid work nobody asked for.
  expect(control("milestone-start-next").disabled).toBe(true);
});

test("Finalize stays dead while any feature is unfinished", () => {
  // Act
  renderDashboard(
    milestone([feature("f1", "completed"), feature("f2", "needs_attention")]),
  );

  // Assert
  expect(control("milestone-finalize").disabled).toBe(true);
});

test("Finalize reports the request once every feature is completed", () => {
  // Arrange
  const handlers = renderDashboard(
    milestone([feature("f1", "completed"), feature("f2", "completed")]),
  );
  expect(control("milestone-finalize").disabled).toBe(false);

  // Act
  fireEvent.click(control("milestone-finalize"));

  // Assert
  expect(handlers.onFinalize).toHaveBeenCalledOnce();
});

test("a busy milestone offers neither action, so a second run cannot be double-started", () => {
  // Act
  renderDashboard(milestone([feature("f1", "ready")]), [], true);

  // Assert
  expect(control("milestone-start-next").disabled).toBe(true);
  expect(control("milestone-autorun").disabled).toBe(true);
});

test("the autorun toggle reports the new value, not the old one", () => {
  // Arrange
  const handlers = renderDashboard(milestone([feature("f1", "ready")]));

  // Act
  fireEvent.click(screen.getByTestId("milestone-autorun"));

  // Assert
  expect(handlers.onToggleAutoRun).toHaveBeenCalledWith(true);
});

function dashboardWithTwoFeatureRuns(): Handlers {
  return renderDashboard(
    milestone([feature("f1", "completed"), feature("f2", "ready")]),
    [
      featureRun("run-a", 3, "completed", "f1"),
      featureRun("run-b", 4, "running", "f2"),
    ],
  );
}

test("each feature shows only its own run history", () => {
  // Act
  dashboardWithTwoFeatureRuns();

  // Assert — the other feature's run must not appear under this one.
  const cards = screen.getAllByTestId("milestone-feature");
  const first = within(cards[0]!).getAllByTestId("milestone-feature-run");
  expect(first).toHaveLength(1);
  expect(first[0]?.textContent).toContain("#3");
});

test("opening a feature's run reports that run's id", () => {
  // Arrange
  const handlers = dashboardWithTwoFeatureRuns();
  const cards = screen.getAllByTestId("milestone-feature");
  const first = within(cards[0]!).getAllByTestId("milestone-feature-run");

  // Act
  fireEvent.click(first[0]!);

  // Assert
  expect(handlers.onOpenRun).toHaveBeenCalledWith("run-a");
});

test("a blocking finding is shown with its severity and its evidence", () => {
  // Act
  renderDashboard(
    milestone([
      feature("f1", "needs_attention", {
        findings: [finding("x1", "Retry loses the draft", "blocking", "run #3 log")],
      }),
    ]),
  );

  // Assert
  expect(screen.getByText("BLOCKING")).toBeDefined();
  expect(screen.getByText(/Retry loses the draft/)).toBeDefined();
  expect(screen.getByText("run #3 log")).toBeDefined();
});

function dashboardWithOneFeaturePerStatus(): Handlers {
  return renderDashboard(
    milestone([
      feature("f1", "completed"),
      feature("f2", "ready"),
      feature("f3", "in_progress"),
      feature("f4", "needs_attention"),
    ]),
  );
}

test("only a needs-attention feature offers acceptance", () => {
  // Act
  dashboardWithOneFeaturePerStatus();

  // Assert — accepting is an override of a blocking finding, not a general action.
  expect(screen.getAllByTestId("milestone-feature-accept")).toHaveLength(1);
});

test("accepting a feature reports that feature's own id", () => {
  // Arrange
  const handlers = dashboardWithOneFeaturePerStatus();

  // Act
  fireEvent.click(screen.getAllByTestId("milestone-feature-accept")[0]!);

  // Assert
  expect(handlers.onAcceptFeature).toHaveBeenCalledWith("f4");
});

test("an accepted feature is marked as accepted rather than passing", () => {
  // Act
  renderDashboard(
    milestone([
      feature("f1", "completed", { acceptedAt: "2026-08-03T09:00:00.000Z" }),
    ]),
  );

  // Assert — an override must not read as a clean pass.
  expect(screen.getByText(/Accepted/)).toBeDefined();
  expect(screen.queryAllByTestId("milestone-feature-accept")).toHaveLength(0);
});

test("a busy milestone cannot accept a feature either", () => {
  // Act
  renderDashboard(milestone([feature("f1", "needs_attention")]), [], true);

  // Assert
  expect(control("milestone-feature-accept").disabled).toBe(true);
});

test("an unapproved milestone says so instead of rendering an empty feature list", () => {
  // Act
  renderDashboard(milestone([], { status: "draft" }));

  // Assert
  expect(screen.getByText(/no features yet/i)).toBeDefined();
  expect(screen.queryAllByTestId("milestone-feature")).toHaveLength(0);
  expect(control("milestone-start-next").disabled).toBe(true);
});

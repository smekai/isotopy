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
  renderDashboard(
    milestone([
      feature("f1", "completed"),
      feature("f2", "needs_attention"),
      feature("f3", "ready"),
    ]),
  );

  expect(screen.getByTestId("milestone-progress").textContent).toBe("1/3 features");
});

test("Start next is live while a feature is ready, and dead once one is running", () => {
  const handlers = renderDashboard(milestone([feature("f1", "ready")]));
  expect(control("milestone-start-next").disabled).toBe(false);
  fireEvent.click(control("milestone-start-next"));
  expect(handlers.onStartNext).toHaveBeenCalledOnce();

  cleanup();
  renderDashboard(milestone([feature("f1", "in_progress"), feature("f2", "ready")]));
  expect(control("milestone-start-next").disabled).toBe(true);
});

test("Finalize stays dead until every feature is completed", () => {
  renderDashboard(
    milestone([feature("f1", "completed"), feature("f2", "needs_attention")]),
  );
  expect(control("milestone-finalize").disabled).toBe(true);

  cleanup();
  const handlers = renderDashboard(
    milestone([feature("f1", "completed"), feature("f2", "completed")]),
  );
  expect(control("milestone-finalize").disabled).toBe(false);
  fireEvent.click(control("milestone-finalize"));
  expect(handlers.onFinalize).toHaveBeenCalledOnce();
});

test("a busy milestone offers neither action, so a second run cannot be double-started", () => {
  renderDashboard(milestone([feature("f1", "ready")]), [], true);

  expect(control("milestone-start-next").disabled).toBe(true);
  expect(control("milestone-autorun").disabled).toBe(true);
});

test("the autorun toggle reports the new value, not the old one", () => {
  const handlers = renderDashboard(milestone([feature("f1", "ready")]));

  fireEvent.click(screen.getByTestId("milestone-autorun"));

  expect(handlers.onToggleAutoRun).toHaveBeenCalledWith(true);
});

test("each feature shows only its own run history, and opening one reports its id", () => {
  const handlers = renderDashboard(
    milestone([feature("f1", "completed"), feature("f2", "ready")]),
    [
      featureRun("run-a", 3, "completed", "f1"),
      featureRun("run-b", 4, "running", "f2"),
    ],
  );

  const cards = screen.getAllByTestId("milestone-feature");
  const first = within(cards[0]!).getAllByTestId("milestone-feature-run");
  expect(first).toHaveLength(1);
  expect(first[0]?.textContent).toContain("#3");

  fireEvent.click(first[0]!);
  expect(handlers.onOpenRun).toHaveBeenCalledWith("run-a");
});

test("a blocking finding is shown with its severity and its evidence", () => {
  renderDashboard(
    milestone([
      feature("f1", "needs_attention", {
        findings: [finding("x1", "Retry loses the draft", "blocking", "run #3 log")],
      }),
    ]),
  );

  expect(screen.getByText("BLOCKING")).toBeDefined();
  expect(screen.getByText(/Retry loses the draft/)).toBeDefined();
  expect(screen.getByText("run #3 log")).toBeDefined();
});

test("only a needs-attention feature offers acceptance, and it reports its own id", () => {
  const handlers = renderDashboard(
    milestone([
      feature("f1", "completed"),
      feature("f2", "ready"),
      feature("f3", "in_progress"),
      feature("f4", "needs_attention"),
    ]),
  );

  const accepts = screen.getAllByTestId("milestone-feature-accept");
  expect(accepts).toHaveLength(1);

  fireEvent.click(accepts[0]!);
  expect(handlers.onAcceptFeature).toHaveBeenCalledWith("f4");
});

test("an accepted feature is marked as accepted rather than passing", () => {
  renderDashboard(
    milestone([
      feature("f1", "completed", { acceptedAt: "2026-08-03T09:00:00.000Z" }),
    ]),
  );

  expect(screen.getByText(/Accepted/)).toBeDefined();
  expect(screen.queryAllByTestId("milestone-feature-accept")).toHaveLength(0);
});

test("a busy milestone cannot accept a feature either", () => {
  renderDashboard(milestone([feature("f1", "needs_attention")]), [], true);

  expect(control("milestone-feature-accept").disabled).toBe(true);
});

test("an unapproved milestone says so instead of rendering an empty feature list", () => {
  renderDashboard(milestone([], { status: "draft" }));

  expect(screen.getByText(/no features yet/i)).toBeDefined();
  expect(screen.queryAllByTestId("milestone-feature")).toHaveLength(0);
  expect(control("milestone-start-next").disabled).toBe(true);
});

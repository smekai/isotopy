// Component test: the detail view is where a schedule's whole history lives, and
// where it is switched off. Both are wrong in ways nobody notices — a history that
// shows another schedule's runs, or a toggle that reports the state it already had.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { ScheduleDashboard } from "../../src/components/schedule/ScheduleDashboard";
import type { ScheduleDashboardProps } from "../../src/components/schedule/ScheduleDashboard";
import { DIRS } from "../../src/theme";
import { orchestration, scheduleView } from "../support/orchestration-fixtures";
import { summary } from "../support/run-fixtures";

afterEach(cleanup);

test("the history lists every run this schedule started, not the project's other runs", () => {
  // Arrange — one run from this schedule, one from a manual initiative beside it.
  const props = dashboardProps({
    runs: [
      summary({ id: "scheduled", orchestrationId: "o1" }),
      summary({ id: "manual", orchestrationId: "o2" }),
    ],
    orchestrations: [
      orchestration({ id: "o1", scheduleId: "s1" }),
      orchestration({ id: "o2" }),
    ],
  });

  // Act
  render(<ScheduleDashboard {...props} />);

  // Assert
  expect(screen.queryByText(/manual/)).toBeNull();
});

test("switching a schedule off reports the state it should become, not the one it had", () => {
  // Arrange
  const props = dashboardProps();
  render(<ScheduleDashboard {...props} />);

  // Act
  fireEvent.click(screen.getByTestId("toggle-schedule"));

  // Assert
  expect(props.onToggleEnabled).toHaveBeenCalledWith(false);
});

test("a schedule that has been skipped says why, rather than reading as never having run", () => {
  // Arrange — a skip and a never-run look identical without this.
  const skipped = scheduleView({
    id: "s1",
    lastOutcome: { kind: "skipped", reason: "run_active" },
  });

  // Act
  render(<ScheduleDashboard {...dashboardProps({ schedule: skipped })} />);

  // Assert
  expect(screen.getByTestId("schedule-detail-last").textContent).toContain("already active");
});

test("a schedule that failed to start says so, instead of reading as having run", () => {
  // Arrange — the failure nobody is watching for; "Last ran" here would be a lie.
  const failed = scheduleView({
    id: "s1",
    lastFiredAt: undefined,
    lastOutcome: { kind: "failed", error: "claude-code is not installed" },
  });

  // Act
  render(<ScheduleDashboard {...dashboardProps({ schedule: failed })} />);

  // Assert
  expect(screen.getByTestId("schedule-detail-last").textContent).toContain(
    "claude-code is not installed",
  );
});

test("a run in the history carries the same actions it has in the rail, not dead buttons", () => {
  // Arrange
  const props = dashboardProps({
    runs: [summary({ id: "scheduled", orchestrationId: "o1", task: "Take the next task" })],
    orchestrations: [orchestration({ id: "o1", scheduleId: "s1" })],
  });
  render(<ScheduleDashboard {...props} />);

  // Act
  fireEvent.click(screen.getByText("Rerun"));

  // Assert
  expect(props.onRerunRun).toHaveBeenCalledWith(expect.objectContaining({ id: "scheduled" }));
});

function dashboardProps(
  overrides: Partial<ScheduleDashboardProps> = {},
): ScheduleDashboardProps {
  return {
    schedule: overrides.schedule ?? scheduleView({ id: "s1" }),
    runs: overrides.runs ?? [],
    orchestrations: overrides.orchestrations ?? [],
    d: overrides.d ?? DIRS.indigo,
    onToggleEnabled: overrides.onToggleEnabled ?? vi.fn(),
    onEdit: overrides.onEdit ?? vi.fn(),
    onDelete: overrides.onDelete ?? vi.fn(),
    onOpenRun: overrides.onOpenRun ?? vi.fn(),
    onRestartRun: overrides.onRestartRun ?? vi.fn(),
    onRerunRun: overrides.onRerunRun ?? vi.fn(),
  };
}

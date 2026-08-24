// Component test: the rail's third section. Recurring work is not a run, and the
// rule that matters is that adding it changed nothing about the runs beside it —
// a schedule row must never behave like, or stand in for, a run card.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { ScheduleList } from "../../src/components/schedule/ScheduleList";
import type { ScheduleListProps } from "../../src/components/schedule/ScheduleList";
import { DIRS } from "../../src/theme";
import { scheduleView } from "../support/orchestration-fixtures";

afterEach(cleanup);

test("a schedule is listed by name with the next fire time the server computed", () => {
  // Act
  render(<ScheduleList {...listProps()} />);

  // Assert
  expect(screen.getByText("Board poller")).toBeTruthy();
  expect(screen.getByTestId("schedule-next-fire").textContent).not.toBe("—");
});

test("a paused schedule shows no next fire time, because it has none", () => {
  // Arrange — the server still sends a computed time; enabled is what decides.
  const paused = scheduleView({ enabled: false, nextFireAt: "2026-09-01T09:00:00.000Z" });

  // Act
  render(<ScheduleList {...listProps({ schedules: [paused] })} />);

  // Assert
  expect(screen.getByTestId("schedule-next-fire").textContent).toBe("—");
});

test("opening a schedule reports the one that was clicked", () => {
  // Arrange
  const props = listProps({
    schedules: [scheduleView({ id: "s1" }), scheduleView({ id: "s2", name: "Weekly review" })],
  });

  render(<ScheduleList {...props} />);

  // Act
  fireEvent.click(screen.getByText("Weekly review"));

  // Assert
  expect(props.onOpenSchedule).toHaveBeenCalledWith("s2");
});

test("the section offers a way to add one, which the Project panel's dead end taught us to check", () => {
  // Arrange
  const props = listProps({ schedules: [] });

  // Act
  render(<ScheduleList {...props} />);
  fireEvent.click(screen.getByTestId("new-schedule"));

  // Assert
  expect(props.onNewSchedule).toHaveBeenCalled();
});

function listProps(overrides: Partial<ScheduleListProps> = {}): ScheduleListProps {
  return {
    schedules: overrides.schedules ?? [scheduleView({ nextFireAt: "2026-09-01T09:00:00.000Z" })],
    selectedScheduleId: overrides.selectedScheduleId ?? null,
    d: overrides.d ?? DIRS.indigo,
    onOpenSchedule: overrides.onOpenSchedule ?? vi.fn(),
    onNewSchedule: overrides.onNewSchedule ?? vi.fn(),
  };
}

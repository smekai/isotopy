// Component test: an overlay, so the repo's overlay rules apply — role, modal
// flag, Escape, and focus moved in and restored. The save payload matters too:
// a schedule saved with the wrong expression fires at the wrong hour unattended.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { ScheduleModal } from "../../src/components/schedule/ScheduleModal";
import type { ScheduleModalProps } from "../../src/components/schedule/ScheduleModal";
import { DIRS } from "../../src/theme";
import { scheduleView } from "../support/orchestration-fixtures";

afterEach(cleanup);

test("the dialog announces itself as modal, so a screen reader does not read the page behind it", () => {
  // Act
  render(<ScheduleModal {...modalProps()} />);

  // Assert
  const dialog = screen.getByTestId("schedule-modal");
  expect(dialog.getAttribute("role")).toBe("dialog");
  expect(dialog.getAttribute("aria-modal")).toBe("true");
});

test("Escape dismisses the dialog, so it is never a trap", () => {
  // Arrange
  const props = modalProps();
  render(<ScheduleModal {...props} />);

  // Act
  fireEvent.keyDown(document, { key: "Escape" });

  // Assert
  expect(props.onDismiss).toHaveBeenCalled();
});

test("focus moves into the dialog when it opens", () => {
  // Act
  render(<ScheduleModal {...modalProps()} />);

  // Assert
  expect(document.activeElement).toBe(screen.getByTestId("schedule-modal"));
});

test("focus returns to whatever opened the dialog when it closes", () => {
  // Arrange
  const opener = document.createElement("button");
  document.body.append(opener);
  opener.focus();
  const view = render(<ScheduleModal {...modalProps()} />);

  // Act
  view.unmount();

  // Assert
  expect(document.activeElement).toBe(opener);
});

test("saving sends the edited expression rather than the one the field started with", () => {
  // Arrange — the failure this catches is a save that silently keeps the default.
  const props = modalProps();
  render(<ScheduleModal {...props} />);
  fireEvent.change(screen.getByTestId("schedule-cron"), { target: { value: "*/30 * * * *" } });

  // Act
  fireEvent.click(screen.getByTestId("schedule-save"));

  // Assert
  expect(props.onSave).toHaveBeenCalledWith(expect.objectContaining({ cron: "*/30 * * * *" }));
});

test("editing an existing schedule keeps the team it was pinned to rather than resetting it", () => {
  // Arrange — the team is the whole point of a schedule; a blind save must not lose it.
  const pinned = scheduleView({ team: { name: "Duo", summary: "Two", roles: [] } });
  const props = modalProps({ schedule: pinned });
  render(<ScheduleModal {...props} />);

  // Act
  fireEvent.click(screen.getByTestId("schedule-save"));

  // Assert
  expect(props.onSave).toHaveBeenCalledWith(expect.objectContaining({ team: pinned.team }));
});

test("a rejected expression is shown in the dialog, not swallowed on the way back", () => {
  // Act
  render(<ScheduleModal {...modalProps({ error: "cron: invalid configuration format" })} />);

  // Assert
  expect(screen.getByTestId("schedule-error").textContent).toContain("invalid configuration");
});

function modalProps(overrides: Partial<ScheduleModalProps> = {}): ScheduleModalProps {
  return {
    schedule: overrides.schedule,
    error: overrides.error ?? null,
    d: overrides.d ?? DIRS.indigo,
    onSave: overrides.onSave ?? vi.fn(),
    onDismiss: overrides.onDismiss ?? vi.fn(),
  };
}

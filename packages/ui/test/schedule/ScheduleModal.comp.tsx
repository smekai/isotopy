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

test("editing an existing schedule keeps the flow it names rather than resetting it", () => {
  // Arrange — the flow is the whole point of a schedule; a blind save must not lose it.
  const pinned = scheduleView({ flow: "board" });
  const props = modalProps({ schedule: pinned });
  render(<ScheduleModal {...props} />);

  // Act
  fireEvent.click(screen.getByTestId("schedule-save"));

  // Assert
  expect(props.onSave).toHaveBeenCalledWith(expect.objectContaining({ flow: "board" }));
});

test("a rejected expression is shown in the dialog, not swallowed on the way back", () => {
  // Act
  render(<ScheduleModal {...modalProps({ error: "cron: invalid configuration format" })} />);

  // Assert
  expect(screen.getByTestId("schedule-error").textContent).toContain("invalid configuration");
});

test("a parent re-render does not steal focus from the field being edited", () => {
  // Arrange — App passes an inline onDismiss, and useSchedules polls every 30s,
  // so the parent re-renders while someone is mid-expression.
  const props = modalProps();
  const view = render(<ScheduleModal {...props} />);
  const cron = screen.getByTestId("schedule-cron");
  cron.focus();

  // Act — a new closure identity, exactly as a parent render produces.
  view.rerender(<ScheduleModal {...props} onDismiss={() => undefined} />);

  // Assert
  expect(document.activeElement).toBe(cron);
});

test("editing a prompt-only schedule keeps it prompt-only, rather than attaching a flow", () => {
  // Arrange — the built-in poller names no flow on purpose: its prompt goes to the
  // Orchestrator. Saving an edit must not quietly move it to the fixed-flow path.
  const promptOnly = scheduleView({ builtIn: "board-poller" });
  const props = modalProps({ schedule: promptOnly });
  render(<ScheduleModal {...props} />);

  // Act
  fireEvent.click(screen.getByTestId("schedule-save"));

  // Assert
  expect(props.onSave).toHaveBeenCalledWith(expect.objectContaining({ flow: null }));
});

test("letting the Orchestrator choose on a schedule that names a flow saves an explicit clear", () => {
  // Arrange — an omitted flow means "unchanged" to the server, so the old flow would survive.
  const props = modalProps({ schedule: scheduleView({ flow: "board" }), flows: ["board"] });
  render(<ScheduleModal {...props} />);
  fireEvent.change(screen.getByTestId("schedule-flow"), { target: { value: "" } });

  // Act
  fireEvent.click(screen.getByTestId("schedule-save"));

  // Assert
  expect(props.onSave).toHaveBeenCalledWith(expect.objectContaining({ flow: null }));
});

test("a flow picked in the dialog is what the schedule is saved with", () => {
  // Arrange
  const props = modalProps({ flows: ["delivery", "discovery"] });
  render(<ScheduleModal {...props} />);
  fireEvent.change(screen.getByTestId("schedule-flow"), { target: { value: "discovery" } });

  // Act
  fireEvent.click(screen.getByTestId("schedule-save"));

  // Assert
  expect(props.onSave).toHaveBeenCalledWith(expect.objectContaining({ flow: "discovery" }));
});

function modalProps(overrides: Partial<ScheduleModalProps> = {}): ScheduleModalProps {
  return {
    schedule: overrides.schedule,
    flows: overrides.flows ?? [],
    error: overrides.error ?? null,
    d: overrides.d ?? DIRS.indigo,
    onSave: overrides.onSave ?? vi.fn(),
    onDismiss: overrides.onDismiss ?? vi.fn(),
  };
}

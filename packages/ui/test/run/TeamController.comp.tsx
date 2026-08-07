// Component test: the bottom bar is the only always-visible surface, so it owns
// the answer to "how do I stop this?". A run parked on a question and an
// initiative that keeps spawning runs are both live work the user must be able
// to end from here.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { TeamController } from "../../src/components/TeamController";
import type { TeamControllerProps } from "../../src/components/TeamController";
import { DIRS } from "../../src/theme";
import { run, stage } from "../support/run-fixtures";

afterEach(() => {
  cleanup();
});

test("a run parked on an agent question can still be aborted", () => {
  // Arrange
  const props = controllerProps({ run: run([stage("design")], "asking") });
  render(<TeamController {...props} />);

  // Act
  fireEvent.click(screen.getByTestId("abort-run"));

  // Assert
  expect(props.onAbort).toHaveBeenCalled();
});

test("a run that has not started a stage yet can still be aborted", () => {
  // Arrange
  const props = controllerProps({ run: run([stage("design")], "pending") });
  render(<TeamController {...props} />);

  // Act
  fireEvent.click(screen.getByTestId("abort-run"));

  // Assert
  expect(props.onAbort).toHaveBeenCalled();
});

test("aborting a run inside an initiative leaves the initiative running", () => {
  // Arrange
  const props = controllerProps({ initiative: { busy: false, onStop: vi.fn() } });
  render(<TeamController {...props} />);

  // Act
  fireEvent.click(screen.getByTestId("abort-run"));

  // Assert
  expect(props.onAbort).toHaveBeenCalled();
  expect(props.initiative?.onStop).not.toHaveBeenCalled();
});

test("a finished run offers no abort, since there is nothing left to stop", () => {
  // Act
  render(<TeamController {...controllerProps({ run: run([stage("design", "passed")], "completed") })} />);

  // Assert
  expect(screen.queryByTestId("abort-run")).toBeNull();
});

test("stopping the initiative ends the chain rather than the attached run", () => {
  // Arrange
  const props = controllerProps({ initiative: { busy: false, onStop: vi.fn() } });
  render(<TeamController {...props} />);

  // Act
  fireEvent.click(screen.getByTestId("stop-initiative"));

  // Assert
  expect(props.initiative?.onStop).toHaveBeenCalled();
  expect(props.onAbort).not.toHaveBeenCalled();
});

test("a run outside any initiative offers no initiative stop", () => {
  // Act
  render(<TeamController {...controllerProps()} />);

  // Assert
  expect(screen.queryByTestId("stop-initiative")).toBeNull();
});

test("an initiative can still be stopped once its current run has finished", () => {
  // Arrange
  const props = controllerProps({
    run: run([stage("design", "passed")], "completed"),
    initiative: { busy: false, onStop: vi.fn() },
  });
  render(<TeamController {...props} />);

  // Act
  fireEvent.click(screen.getByTestId("stop-initiative"));

  // Assert
  expect(props.initiative?.onStop).toHaveBeenCalled();
});

function controllerProps(overrides: Partial<TeamControllerProps> = {}): TeamControllerProps {
  return {
    d: DIRS.indigo,
    run: run([stage("design", "running")]),
    pipeVs: "idle",
    onCycleVoice: vi.fn(),
    onApprove: vi.fn(),
    onAbort: vi.fn(),
    onRestart: vi.fn(),
    onNewRun: vi.fn(),
    ...overrides,
  };
}

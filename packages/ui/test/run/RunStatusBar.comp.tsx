// Component test: the status bar is where an initiative reports itself, so it is
// where the Orchestrator's own spend has to appear. TASK-141 read $0.35 there
// while three decision turns had been billed elsewhere, so the number the user
// saw was not the number the initiative had cost.
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { RunStatusBar } from "../../src/components/RunStatusBar";
import type { InitiativeChrome } from "../../src/components/RunStatusBar";
import { DIRS } from "../../src/theme";
import { run, stage } from "../support/run-fixtures";

afterEach(() => {
  cleanup();
});

test("an initiative reports what its Orchestrator spent, beside its status", () => {
  // Arrange
  const chrome = initiative({ spend: "$0.21" });

  // Act
  render(<RunStatusBar run={run([stage("solo")], "completed")} d={DIRS.indigo} initiative={chrome} />);

  // Assert
  expect(screen.getByTestId("orchestrator-spend").textContent).toBe("$0.21");
});

test("an initiative that has not decided anything yet shows no figure at all", () => {
  // Arrange — an empty cost is silence, not $0.00.
  const chrome = initiative();

  // Act
  render(<RunStatusBar run={run([stage("solo")], "running")} d={DIRS.indigo} initiative={chrome} />);

  // Assert
  expect(screen.queryByTestId("orchestrator-spend")).toBeNull();
});

function initiative(overrides: Partial<InitiativeChrome> = {}): InitiativeChrome {
  return { statusLabel: "RUNNING", needsUser: false, ...overrides };
}

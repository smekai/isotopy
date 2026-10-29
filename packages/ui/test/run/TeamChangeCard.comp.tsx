import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { TeamChangeCard } from "../../src/components/run/TeamChangeCard";
import type { TeamChangeCardProps } from "../../src/components/run/TeamChangeCard";
import { DIRS } from "../../src/theme";
import { CURRENT_TEAM, PROPOSED_TEAM } from "../support/orchestration-fixtures";

afterEach(() => {
  cleanup();
});

test("an open change shows what it adds to team.md, against the file as it stands", () => {
  // Act
  render(<TeamChangeCard {...cardProps()} />);

  // Assert
  const added = screen.getByTestId("team-change-diff").querySelectorAll('[data-kind="added"]');
  expect([...added].map((line) => line.textContent)).toEqual(["+   - id: test"]);
});

test("approving the change reports it rather than acting on it", () => {
  // Arrange
  const props = cardProps();
  render(<TeamChangeCard {...props} />);

  // Act
  fireEvent.click(screen.getByTestId("approve-team-change"));

  // Assert
  expect(props.onApprove).toHaveBeenCalledTimes(1);
});

test("a change that is no longer awaited offers nothing to approve", () => {
  // Act
  render(<TeamChangeCard {...cardProps({ awaitingApproval: false })} />);

  // Assert
  expect(screen.queryByTestId("approve-team-change")).toBeNull();
});

function cardProps(overrides: Partial<TeamChangeCardProps> = {}): TeamChangeCardProps {
  return {
    rationale: overrides.rationale ?? "Verification keeps coming back on its own",
    proposed: overrides.proposed ?? PROPOSED_TEAM,
    current: overrides.current ?? CURRENT_TEAM,
    awaitingApproval: overrides.awaitingApproval ?? true,
    busy: overrides.busy ?? false,
    d: overrides.d ?? DIRS.indigo,
    onApprove: overrides.onApprove ?? vi.fn(),
  };
}

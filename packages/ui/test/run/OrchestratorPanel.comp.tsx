// Component test: the team card is the only place a user sees what each role
// will cost before agreeing to it, and the only place they can change it. What
// is worth guarding is that the Orchestrator's choice is visible rather than
// buried, that a role it left alone says so, and that an edit is reported
// upward rather than held privately by the panel.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { OrchestratorPanel } from "../../src/components/run/OrchestratorPanel";
import type { OrchestratorPanelProps } from "../../src/components/run/OrchestratorPanel";
import { DIRS } from "../../src/theme";
import { orchestration, role, team } from "../support/orchestration-fixtures";

const d = DIRS.indigo;

afterEach(cleanup);

test("the preset the Orchestrator chose for a role is shown before the user agrees to it", () => {
  // Act
  render(<OrchestratorPanel {...panelProps()} />);

  // Assert
  expect(screen.getByTestId("role-tier-design")).toHaveProperty("value", "deep");
});

test("a role the Orchestrator left alone reads as the run default, not as a guess", () => {
  // Act
  render(<OrchestratorPanel {...panelProps()} />);

  // Assert
  expect(screen.getByTestId("role-tier-implementation")).toHaveProperty("value", "");
});

test("changing a role's preset is reported upward rather than kept inside the panel", () => {
  // Arrange
  const onRoleTierChange = vi.fn();

  // Act
  fireEvent.change(
    render(<OrchestratorPanel {...panelProps({ onRoleTierChange })} />).getByTestId(
      "role-tier-implementation",
    ),
    { target: { value: "fast" } },
  );

  // Assert
  expect(onRoleTierChange).toHaveBeenCalledWith("implementation", "fast");
});

test("choosing the run default reports a cleared preset, not an absent edit", () => {
  // Arrange — undefined would read as "unchanged" and snap back to the proposal.
  const onRoleTierChange = vi.fn();

  // Act
  fireEvent.change(
    render(<OrchestratorPanel {...panelProps({ onRoleTierChange })} />).getByTestId(
      "role-tier-design",
    ),
    { target: { value: "" } },
  );

  // Assert
  expect(onRoleTierChange).toHaveBeenCalledWith("design", null);
});

test("a cleared preset holds the control on the run default rather than the proposal", () => {
  // Act
  render(<OrchestratorPanel {...panelProps({ roleTiers: { design: null } })} />);

  // Assert
  expect(screen.getByTestId("role-tier-design")).toHaveProperty("value", "");
});

test("a pending edit wins over what the Orchestrator proposed, so the card shows what will run", () => {
  // Act
  render(<OrchestratorPanel {...panelProps({ roleTiers: { design: "fast" } })} />);

  // Assert
  expect(screen.getByTestId("role-tier-design")).toHaveProperty("value", "fast");
});

test("every role on the team gets its own control, so none is silently left on the default", () => {
  // Act
  render(<OrchestratorPanel {...panelProps()} />);

  // Assert
  const card = screen.getByTestId("orchestrator-team");
  expect(within(card).getAllByRole("combobox")).toHaveLength(2);
});

function panelProps(overrides: Partial<OrchestratorPanelProps> = {}): OrchestratorPanelProps {
  return {
    d,
    orchestration: orchestration({
      status: "awaiting_approval",
      latestDecision: {
        action: "propose_team",
        rationale: "Design first, then build.",
        team: team({
          roles: [
            role({ id: "design", label: "Architect", skill: "software-architect", modelTier: "deep" }),
            role({ id: "implementation", label: "Developer" }),
          ],
        }),
      },
    }),
    runs: [],
    busy: false,
    roleTiers: {},
    onApprove: vi.fn(),
    onRoleTierChange: vi.fn(),
    onStop: vi.fn(),
    onOpenRun: vi.fn(),
    ...overrides,
  };
}

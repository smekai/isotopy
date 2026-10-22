// Component test: the team card is the only place a user sees what each role
// will cost before agreeing to it, and the only place they can change it. What
// is worth guarding is that the Orchestrator's choice is visible rather than
// buried, that a role it left alone says so, and that an edit is reported
// upward rather than held privately by the card. It now sits in the thread,
// which is also why an already-approved proposal must stop offering approval.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { bundledRosterFor, resolveTier, resolvedModelLabel } from "@isotopy/core";
import { TeamProposalCard } from "../../src/components/run/TeamProposalCard";
import type { TeamProposalCardProps } from "../../src/components/run/TeamProposalCard";
import { DIRS } from "../../src/theme";
import { role, runHarness, team } from "../support/orchestration-fixtures";

const d = DIRS.indigo;

afterEach(cleanup);

test("the preset the Orchestrator chose for a role is shown before the user agrees to it", () => {
  // Act
  render(<TeamProposalCard {...cardProps()} />);

  // Assert
  expect(screen.getByTestId("role-tier-design")).toHaveProperty("value", "deep");
});

test("a role the Orchestrator left alone reads as the run default, not as a guess", () => {
  // Act
  render(<TeamProposalCard {...cardProps()} />);

  // Assert
  expect(screen.getByTestId("role-tier-implementation")).toHaveProperty("value", "");
});

test("changing a role's preset is reported upward rather than kept inside the card", () => {
  // Arrange
  const onRoleTierChange = vi.fn();

  // Act
  fireEvent.change(
    render(<TeamProposalCard {...cardProps({ onRoleTierChange })} />).getByTestId(
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
    render(<TeamProposalCard {...cardProps({ onRoleTierChange })} />).getByTestId(
      "role-tier-design",
    ),
    { target: { value: "" } },
  );

  // Assert
  expect(onRoleTierChange).toHaveBeenCalledWith("design", null);
});

test("a cleared preset holds the control on the run default rather than the proposal", () => {
  // Act
  render(<TeamProposalCard {...cardProps({ roleTiers: { design: null } })} />);

  // Assert
  expect(screen.getByTestId("role-tier-design")).toHaveProperty("value", "");
});

test("a pending edit wins over what the Orchestrator proposed, so the card shows what will run", () => {
  // Act
  render(<TeamProposalCard {...cardProps({ roleTiers: { design: "fast" } })} />);

  // Assert
  expect(screen.getByTestId("role-tier-design")).toHaveProperty("value", "fast");
});

test("every role on the team gets its own control, so none is silently left on the default", () => {
  // Act
  render(<TeamProposalCard {...cardProps()} />);

  // Assert
  const card = screen.getByTestId("orchestrator-team");
  expect(within(card).getAllByRole("combobox")).toHaveLength(2);
});

test("a proposal already agreed to stays in the scrollback without offering approval again", () => {
  // Act
  render(<TeamProposalCard {...cardProps({ awaitingApproval: false })} />);

  // Assert
  expect(screen.queryByTestId("approve-team")).toBeNull();
  expect(screen.getByTestId("orchestrator-team")).toBeDefined();
});

test("an approved team reads back as what was agreed, not as an editable form", () => {
  // Act
  render(<TeamProposalCard {...cardProps({ awaitingApproval: false })} />);

  // Assert
  expect(screen.queryByTestId("role-tier-design")).toBeNull();
});

test("each preset offered for a role names the model it would run on this harness", () => {
  // Arrange — Codex, so a model from the default harness would be the wrong answer.
  const roster = bundledRosterFor("codex");
  const deep = resolvedModelLabel(resolveTier("codex", "deep", roster));

  // Act
  render(<TeamProposalCard {...cardProps({ harness: runHarness({ engine: "codex", roster }) })} />);

  // Assert
  const control = screen.getByTestId("role-tier-implementation");
  expect(within(control).getByRole("option", { name: `Deep — ${deep}` })).toBeDefined();
});

test("the run default names the preset and model a role inherits when left alone", () => {
  // Arrange
  const harness = runHarness({ modelTier: "balanced" });
  const balanced = resolvedModelLabel(resolveTier("claude-code", "balanced", harness.roster));

  // Act
  render(<TeamProposalCard {...cardProps({ harness })} />);

  // Assert
  const control = screen.getByTestId("role-tier-implementation");
  expect(
    within(control).getByRole("option", { name: `Run default (Balanced) — ${balanced}` }),
  ).toBeDefined();
});

test("a model pinned in Setup is named on the card, because it outranks every role's preset", () => {
  // Act
  render(<TeamProposalCard {...cardProps({ harness: runHarness({ pinnedModel: "opus" }) })} />);

  // Assert
  expect(screen.getByTestId("team-pinned-model").textContent).toContain("opus");
});

function cardProps(overrides: Partial<TeamProposalCardProps> = {}): TeamProposalCardProps {
  return {
    d,
    team: team({
      roles: [
        role({ id: "design", label: "Architecting", skill: "software-architect", modelTier: "deep" }),
        role({ id: "implementation", label: "Implementing" }),
      ],
    }),
    awaitingApproval: overrides.awaitingApproval ?? true,
    busy: overrides.busy ?? false,
    harness: overrides.harness ?? runHarness(),
    roleTiers: overrides.roleTiers ?? {},
    onApprove: overrides.onApprove ?? vi.fn(),
    onRoleTierChange: overrides.onRoleTierChange ?? vi.fn(),
  };
}

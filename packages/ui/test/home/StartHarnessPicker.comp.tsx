// Component test: the harness and the model are the two things a run spends
// money with, and until now neither was ever put to the user — both were copied
// silently from Setup. What is worth guarding is that a choice made here leaves
// nothing stale behind it: a tier belonging to the previous harness, or an exact
// model pinned earlier that would outrank the tier just chosen. A preset is only
// an intent, so each one must also say which model it stands for on this harness.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { bundledRosterFor, resolveTier, resolvedModelLabel } from "@isotopy/core";
import { StartHarnessPicker } from "../../src/components/home/StartHarnessPicker";
import type { StartHarnessPickerProps } from "../../src/components/home/StartHarnessPicker";
import { DIRS } from "../../src/theme";

const d = DIRS.indigo;

afterEach(cleanup);

test("switching harness re-defaults the model, because a tier names different models per harness", () => {
  // Arrange — Cursor's economical answer is its own routing, not the Fast ladder.
  const onChange = vi.fn();

  // Act
  fireEvent.change(
    render(<StartHarnessPicker {...pickerProps({ onChange })} />).getByTestId("start-engine"),
    { target: { value: "cursor" } },
  );

  // Assert
  expect(onChange).toHaveBeenCalledWith("cursor", "economy");
});

test("changing the model keeps the harness rather than re-defaulting it", () => {
  // Arrange
  const onChange = vi.fn();

  // Act
  fireEvent.change(
    render(<StartHarnessPicker {...pickerProps({ onChange })} />).getByTestId("start-tier"),
    { target: { value: "deep" } },
  );

  // Assert
  expect(onChange).toHaveBeenCalledWith("claude-code", "deep");
});

test("each preset on offer names the model it resolves to on the chosen harness", () => {
  // Arrange — Codex, so a model from the default harness would be the wrong answer.
  const roster = bundledRosterFor("codex");
  const max = resolvedModelLabel(resolveTier("codex", "max", roster));

  // Act
  render(<StartHarnessPicker {...pickerProps({ engine: "codex", roster })} />);

  // Assert
  expect(screen.getByRole("option", { name: `Max — ${max}` })).toBeDefined();
});

function pickerProps(
  overrides: Partial<StartHarnessPickerProps> = {},
): StartHarnessPickerProps {
  const engine = overrides.engine ?? "claude-code";
  return {
    d,
    engine,
    modelTier: overrides.modelTier ?? "fast",
    roster: overrides.roster ?? bundledRosterFor(engine),
    onChange: overrides.onChange ?? vi.fn(),
  };
}

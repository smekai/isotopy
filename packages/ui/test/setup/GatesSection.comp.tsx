// Component test: the Gates screen used to list gates it could not change and
// stamp every one of them ENABLED. What it shows now has to be what the project
// stored — and a stage nobody has configured has to show what its pipeline ships,
// not a default invented by the screen.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { defaultProjectPreferences } from "@isotopy/core";
import type { ProjectPreferences } from "@isotopy/core";
import { GatesSection } from "../../src/components/setup/GatesSection";
import type { SettingsController } from "../../src/hooks/useSettings";
import { DIRS } from "../../src/theme";

afterEach(() => {
  cleanup();
});

test("a stage nobody has configured shows the gate its pipeline ships", () => {
  // Arrange
  const settings = controller();

  // Act
  render(<GatesSection d={DIRS.indigo} settings={settings} />);

  // Assert — pm-dev-test ships a gate after intake and none after implementation.
  expect(screen.getByTestId("gate-toggle-pm-dev-test:intake").getAttribute("aria-pressed")).toBe("true");
  expect(
    screen.getByTestId("gate-toggle-pm-dev-test:implementation").getAttribute("aria-pressed"),
  ).toBe("false");
});

test("a stored override wins over what the pipeline ships", () => {
  // Arrange
  const settings = controller({ gates: { "pm-dev-test:intake": false } });

  // Act
  render(<GatesSection d={DIRS.indigo} settings={settings} />);

  // Assert
  expect(screen.getByTestId("gate-toggle-pm-dev-test:intake").getAttribute("aria-pressed")).toBe("false");
});

test("turning a shipped gate off writes the override the run will read", () => {
  // Arrange
  const settings = controller();
  render(<GatesSection d={DIRS.indigo} settings={settings} />);

  // Act
  fireEvent.click(screen.getByTestId("gate-toggle-pm-dev-test:intake"));

  // Assert
  expect(settings.update).toHaveBeenCalledWith({ gates: { "pm-dev-test:intake": false } });
});

test("adding a gate after a stage that ships without one writes it on", () => {
  // Arrange
  const settings = controller();
  render(<GatesSection d={DIRS.indigo} settings={settings} />);

  // Act
  fireEvent.click(screen.getByTestId("gate-toggle-pm-dev-test:implementation"));

  // Assert
  expect(settings.update).toHaveBeenCalledWith({
    gates: { "pm-dev-test:implementation": true },
  });
});

test("the Orchestrator's own pipeline is not offered, because a composed team owns its gates", () => {
  // Arrange
  const settings = controller();

  // Act
  render(<GatesSection d={DIRS.indigo} settings={settings} />);

  // Assert
  expect(screen.queryByTestId("gate-toggle-orchestration:orchestrate")).toBeNull();
});

function controller(preferences: Partial<ProjectPreferences> = {}): SettingsController {
  return {
    view: null,
    preferences: { ...defaultProjectPreferences(), ...preferences },
    ready: true,
    error: null,
    update: vi.fn(),
    updateConnection: vi.fn(),
  };
}

// Component test: the Project panel is where a newcomer is told to add a project,
// so it has to be where they can.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { HOME_PROJECT_ID, defaultProjectPreferences } from "@isotopy/core";
import { ProjectDrawer } from "../src/components/ProjectDrawer";
import type { ProjectDrawerProps } from "../src/components/ProjectDrawer";
import type { SettingsController } from "../src/hooks/useSettings";
import { DIRS } from "../src/theme";

const settings: SettingsController = {
  view: null,
  preferences: defaultProjectPreferences(),
  ready: true,
  error: null,
  update: vi.fn(),
  updateConnection: vi.fn(),
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

test("on Home, the panel that says to add a project offers the control that adds one", () => {
  // Arrange
  const props = drawerProps({ projectId: HOME_PROJECT_ID });
  render(<ProjectDrawer {...props} />);

  // Act
  fireEvent.click(screen.getByRole("button", { name: /Add project/ }));

  // Assert
  expect(props.onAddProject).toHaveBeenCalledTimes(1);
});

function drawerProps(overrides: Partial<ProjectDrawerProps> = {}): ProjectDrawerProps {
  return {
    d: overrides.d ?? DIRS.indigo,
    projectId: overrides.projectId ?? HOME_PROJECT_ID,
    project: overrides.project,
    settings: overrides.settings ?? settings,
    run: overrides.run ?? null,
    onOpenSetup: overrides.onOpenSetup ?? vi.fn(),
    onAddProject: overrides.onAddProject ?? vi.fn(),
    onClose: overrides.onClose ?? vi.fn(),
  };
}

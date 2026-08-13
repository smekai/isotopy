// Component test: this section writes the commands Isotopy will later execute on
// the user's machine, so what matters is that what the form shows is what gets
// saved — and that production never deploys without an explicit confirmation.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import type { ProjectAutomationConfig } from "@isotopy/core";
import { AutomationSection } from "../../src/components/setup/AutomationSection";
import type { AutomationSectionProps } from "../../src/components/setup/AutomationSection";
import { DIRS } from "../../src/theme";
import { deployProduction, fetchAutomationConfig, updateAutomationConfig } from "../../src/api";

vi.mock("../../src/api", () => ({
  fetchAutomationConfig: vi.fn(),
  updateAutomationConfig: vi.fn(),
  deployProduction: vi.fn(),
}));

const fetchConfig = vi.mocked(fetchAutomationConfig);
const saveConfig = vi.mocked(updateAutomationConfig);
const deploy = vi.mocked(deployProduction);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

test("a project with no automation shows the empty form rather than an error", async () => {
  // Arrange
  served(automationConfig());

  // Act
  render(<AutomationSection {...sectionProps()} />);

  // Assert
  expect(await screen.findByText("Deploy targets")).toBeTruthy();
  expect(screen.getByText("Start the product")).toBeTruthy();
});

test("choosing a provider saves the preset command for the selected environment", async () => {
  // Arrange
  served(automationConfig());
  saveConfig.mockImplementation((config) => Promise.resolve(config));
  render(<AutomationSection {...sectionProps()} />);
  await screen.findByText("Deploy targets");
  fireEvent.click(screen.getByLabelText("preview Vercel"));

  // Act
  fireEvent.click(screen.getByText("Save automation"));

  // Assert
  await waitFor(() => expect(saveConfig).toHaveBeenCalledTimes(1));
  expect(saveConfig.mock.calls[0]?.[0].preview).toMatchObject({
    provider: "vercel",
    command: { executable: "npx", windows: { executable: "npx.cmd" } },
  });
});

test("an edited executable is what gets saved, not the preset it started from", async () => {
  // Arrange
  served(automationConfig());
  saveConfig.mockImplementation((config) => Promise.resolve(config));
  render(<AutomationSection {...sectionProps()} />);
  await screen.findByText("Deploy targets");
  fireEvent.click(screen.getByLabelText("preview Custom command"));
  fireEvent.change(screen.getByLabelText("preview deploy executable"), {
    target: { value: "./deploy.sh" },
  });

  // Act
  fireEvent.click(screen.getByText("Save automation"));

  // Assert
  await waitFor(() => expect(saveConfig).toHaveBeenCalledTimes(1));
  expect(saveConfig.mock.calls[0]?.[0].preview?.command.executable).toBe("./deploy.sh");
});

test("a failed save surfaces the server's reason instead of reporting success", async () => {
  // Arrange
  served(automationConfig());
  saveConfig.mockRejectedValue(new Error("Working directory must stay inside the project"));
  render(<AutomationSection {...sectionProps()} />);
  await screen.findByText("Deploy targets");

  // Act
  fireEvent.click(screen.getByText("Save automation"));

  // Assert
  expect(
    await screen.findByText("Working directory must stay inside the project"),
  ).toBeTruthy();
  expect(screen.queryByText("Automation saved.")).toBeNull();
});

test("the production deployment button appears only for a configured production target", async () => {
  // Arrange
  served(automationConfig());
  render(<AutomationSection {...sectionProps()} />);
  await screen.findByText("Deploy targets");

  // Act
  fireEvent.click(screen.getByText("Production"));

  // Assert
  expect(screen.queryByText("Deploy production…")).toBeNull();
});

test("declining the confirmation leaves production undeployed", async () => {
  // Arrange
  served(automationConfig({ production: vercelTarget() }));
  vi.stubGlobal("confirm", vi.fn().mockReturnValue(false));
  render(<AutomationSection {...sectionProps()} />);
  await screen.findByText("Deploy targets");
  fireEvent.click(screen.getByText("Production"));

  // Act
  fireEvent.click(screen.getByText("Deploy production…"));

  // Assert
  await waitFor(() => expect(window.confirm).toHaveBeenCalledTimes(1));
  expect(deploy).not.toHaveBeenCalled();
});

test("confirming the prompt deploys production and reports the URL it returned", async () => {
  // Arrange
  served(automationConfig({ production: vercelTarget() }));
  saveConfig.mockImplementation((config) => Promise.resolve(config));
  deploy.mockResolvedValue({ id: "d1", result: deploymentResult() });
  vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));
  render(<AutomationSection {...sectionProps()} />);
  await screen.findByText("Deploy targets");
  fireEvent.click(screen.getByText("Production"));

  // Act
  fireEvent.click(screen.getByText("Deploy production…"));

  // Assert
  expect(
    await screen.findByText(/Production deployment passed — https:\/\/live\.test/),
  ).toBeTruthy();
});

test("a Windows override that already differs survives an edit to the base arguments", async () => {
  // Arrange — arguments that only make sense on their own platform, as a hand-edited
  // automation.json would carry them.
  served(automationConfig({ preview: divergentTarget() }));
  saveConfig.mockImplementation((config) => Promise.resolve(config));
  render(<AutomationSection {...sectionProps()} />);
  await screen.findByText("Deploy targets");
  fireEvent.change(screen.getByLabelText("preview deploy arguments"), {
    target: { value: "deploy\n--prod" },
  });

  // Act
  fireEvent.click(screen.getByText("Save automation"));

  // Assert
  await waitFor(() => expect(saveConfig).toHaveBeenCalledTimes(1));
  expect(saveConfig.mock.calls[0]?.[0].preview?.command).toMatchObject({
    args: ["deploy", "--prod"],
    windows: { executable: "deploy.cmd", args: ["deploy", "/prod"] },
  });
});

test("a Windows override that mirrors the base command follows it when the arguments change", async () => {
  // Arrange
  served(automationConfig());
  saveConfig.mockImplementation((config) => Promise.resolve(config));
  render(<AutomationSection {...sectionProps()} />);
  await screen.findByText("Deploy targets");
  fireEvent.click(screen.getByLabelText("preview Vercel"));

  // Act
  fireEvent.change(screen.getByLabelText("preview deploy arguments"), {
    target: { value: "vercel\ndeploy" },
  });

  // Assert
  fireEvent.click(screen.getByText("Save automation"));
  await waitFor(() => expect(saveConfig).toHaveBeenCalledTimes(1));
  expect(saveConfig.mock.calls[0]?.[0].preview?.command.windows).toEqual({
    executable: "npx.cmd",
    args: ["vercel", "deploy"],
  });
});

test("adding a validation command after a deletion does not reuse an id the server would reject", async () => {
  // Arrange — the id the old counter would hand out is the one still in use.
  served(automationConfig({ validation: [validationCommand("check-2")] }));
  saveConfig.mockImplementation((config) => Promise.resolve(config));
  render(<AutomationSection {...sectionProps()} />);
  await screen.findByText("Validation commands");

  // Act
  fireEvent.click(screen.getByText("Add a validation command"));

  // Assert
  fireEvent.click(screen.getByText("Save automation"));
  await waitFor(() => expect(saveConfig).toHaveBeenCalledTimes(1));
  expect(saveConfig.mock.calls[0]?.[0].validation.map((command) => command.id)).toEqual([
    "check-2",
    "check-1",
  ]);
});

function sectionProps(overrides: Partial<AutomationSectionProps> = {}): AutomationSectionProps {
  return {
    d: overrides.d ?? DIRS.indigo,
    projectId: overrides.projectId ?? "project-1",
  };
}

function served(config: ProjectAutomationConfig): void {
  fetchConfig.mockResolvedValue(config);
}

function automationConfig(
  overrides: Partial<ProjectAutomationConfig> = {},
): ProjectAutomationConfig {
  return {
    ...overrides,
    version: 1,
    validation: overrides.validation ?? [],
  };
}

function vercelTarget() {
  return {
    provider: "vercel" as const,
    command: { executable: "npx", args: ["vercel", "deploy"], timeoutMs: 60_000 },
    healthTimeoutMs: 60_000,
    healthIntervalMs: 1_000,
  };
}

function divergentTarget() {
  return {
    provider: "custom" as const,
    command: {
      executable: "./deploy.sh",
      args: ["deploy"],
      timeoutMs: 60_000,
      windows: { executable: "deploy.cmd", args: ["deploy", "/prod"] },
    },
    healthTimeoutMs: 60_000,
    healthIntervalMs: 1_000,
  };
}

function validationCommand(id: string) {
  return {
    id,
    label: "Tests",
    command: { executable: "npm", args: ["test"], timeoutMs: 900_000 },
  };
}

function deploymentResult() {
  return {
    environment: "production" as const,
    provider: "vercel" as const,
    verdict: "pass" as const,
    command: { executable: "npx", args: ["vercel", "deploy"] },
    cwd: "/projects/app",
    exitCode: 0,
    durationMs: 1200,
    url: "https://live.test/",
    healthStatus: "passed" as const,
    startedAt: "2026-08-10T09:00:00.000Z",
    finishedAt: "2026-08-10T09:00:01.200Z",
  };
}

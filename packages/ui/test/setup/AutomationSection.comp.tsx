// Component test: this section writes the commands ADHD will later execute on
// the user's machine, so what matters is that what the form shows is what gets
// saved — and that production never deploys without an explicit confirmation.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import type { ProjectAutomationConfig } from "@adhd/core";
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
    version: 1,
    validation: overrides.validation ?? [],
    ...(overrides.ui === undefined ? {} : { ui: overrides.ui }),
    ...(overrides.preview === undefined ? {} : { preview: overrides.preview }),
    ...(overrides.production === undefined ? {} : { production: overrides.production }),
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

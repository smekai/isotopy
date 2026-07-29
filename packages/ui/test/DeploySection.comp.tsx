import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { EMPTY_AUTOMATION_CONFIG } from "@adhd/core";
import type { ProjectAutomationConfig } from "@adhd/core";
import {
  fetchAutomationConfig,
  updateAutomationConfig,
} from "../src/api";
import { DeploySection } from "../src/components/setup/DeploySection";
import {
  argumentsFromText,
  deploymentPreset,
} from "../src/components/setup/deploy-config";
import { DIRS } from "../src/theme";

vi.mock("../src/api", () => ({
  fetchAutomationConfig: vi.fn(),
  updateAutomationConfig: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

function loadedConfig(): ProjectAutomationConfig {
  return structuredClone(EMPTY_AUTOMATION_CONFIG);
}

test("deploy arguments are stored as an array rather than a shell command", () => {
  expect(argumentsFromText("deploy\n--yes\n\n --target=preview ")).toEqual([
    "deploy",
    "--yes",
    "--target=preview",
  ]);
});

test("the Vercel preset includes a Windows executable override", () => {
  expect(deploymentPreset("vercel").command).toMatchObject({
    executable: "npx",
    args: ["vercel", "deploy", "--yes"],
    windows: {
      executable: "npx.cmd",
      args: ["vercel", "deploy", "--yes"],
    },
  });
});

test("selecting and editing a preview target saves the complete project config", async () => {
  // Arrange
  const initial = loadedConfig();
  vi.mocked(fetchAutomationConfig).mockResolvedValue(initial);
  vi.mocked(updateAutomationConfig).mockImplementation(async (value) => value);
  render(<DeploySection d={DIRS.indigo} />);
  await screen.findByText("Custom command");

  // Act
  fireEvent.click(screen.getByText("Custom command"));
  fireEvent.change(screen.getByLabelText("Deploy executable"), {
    target: { value: "node" },
  });
  fireEvent.change(screen.getByLabelText("Deploy arguments"), {
    target: { value: "scripts/preview.mjs\n--json" },
  });
  fireEvent.change(screen.getByLabelText("Deployment URL"), {
    target: { value: "https://preview.example.test" },
  });
  fireEvent.click(screen.getByText("Save deployment setup"));

  // Assert
  await waitFor(() => expect(updateAutomationConfig).toHaveBeenCalledOnce());
  expect(vi.mocked(updateAutomationConfig).mock.calls[0]![0]).toMatchObject({
    version: 1,
    validation: [],
    preview: {
      provider: "custom",
      command: {
        executable: "node",
        args: ["scripts/preview.mjs", "--json"],
      },
      url: "https://preview.example.test",
    },
    production: null,
  });
  expect(await screen.findByText("Deployment setup saved.")).toBeTruthy();
});

test("production is configured independently and remains explicitly gated", async () => {
  // Arrange
  vi.mocked(fetchAutomationConfig).mockResolvedValue(loadedConfig());
  vi.mocked(updateAutomationConfig).mockImplementation(async (value) => value);
  render(<DeploySection d={DIRS.indigo} />);
  await screen.findByText("Custom command");

  // Act
  fireEvent.click(screen.getByText("Production"));
  fireEvent.click(screen.getByText("Docker Compose"));
  fireEvent.click(screen.getByText("Save deployment setup"));

  // Assert
  await waitFor(() => expect(updateAutomationConfig).toHaveBeenCalledOnce());
  expect(vi.mocked(updateAutomationConfig).mock.calls[0]![0]).toMatchObject({
    preview: null,
    production: {
      provider: "docker-compose",
      command: {
        executable: "docker",
        args: ["compose", "up", "--detach", "--build"],
      },
    },
  });
  expect(
    screen.getByText(/Production always needs separate human approval/),
  ).toBeTruthy();
});

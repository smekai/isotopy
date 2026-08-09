// Component test: models turn over monthly, so what the user picks here is an
// intent — "how much thinking does this need" — and the system resolves it. The
// thing that must never happen is a preset quietly standing for a model the user
// did not expect, so every test here is about what the choice actually resolves to.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import type { EngineModelRoster } from "@adhd/core";
import { EngineModelPicker } from "../../src/components/setup/EngineModelPicker";
import type { EngineModelPickerProps } from "../../src/components/setup/EngineModelPicker";
import { DIRS } from "../../src/theme";
import { fetchEngineModels } from "../../src/api";
import { modelOption, roster } from "../support/engine-fixtures";

vi.mock("../../src/api", () => ({
  fetchEngineModels: vi.fn(),
}));

const fetchModels = vi.mocked(fetchEngineModels);

const REVEAL_ROSTER = /Pick an exact model instead/;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function pickerProps(overrides: Partial<EngineModelPickerProps> = {}): EngineModelPickerProps {
  return {
    d: DIRS.indigo,
    engine: "claude-code",
    tier: "balanced",
    refreshKey: 0,
    onSelectTier: vi.fn(),
    onSelectModel: vi.fn(),
    ...overrides,
  };
}

function served(value: EngineModelRoster): void {
  fetchModels.mockResolvedValue(value);
}

const CLAUDE_ROSTER = roster({
  options: [
    modelOption({ id: "", label: "Auto", origin: "auto" }),
    modelOption({ id: "haiku", label: "Haiku" }),
    modelOption({ id: "sonnet", label: "Sonnet" }),
    modelOption({ id: "opus", label: "Opus" }),
  ],
});

test("the choice offered is an intent, not a roster of ids", async () => {
  // Arrange
  served(CLAUDE_ROSTER);

  // Act
  render(<EngineModelPicker {...pickerProps()} />);

  // Assert
  await waitFor(() => expect(screen.getByText("Balanced")).toBeTruthy());
  expect(screen.getByText("Deep")).toBeTruthy();
});

test("a preset says which model and effort it resolved to", async () => {
  // Arrange
  served(CLAUDE_ROSTER);

  // Act
  render(<EngineModelPicker {...pickerProps({ tier: "deep" })} />);

  // Assert
  await waitFor(() => expect(screen.getByText("→ opus · effort high")).toBeTruthy());
});

test("choosing a preset reports the tier, not a model id", async () => {
  // Arrange
  served(CLAUDE_ROSTER);
  const props = pickerProps();
  render(<EngineModelPicker {...props} />);
  await screen.findByText("Fast");

  // Act
  fireEvent.click(screen.getByText("Fast"));

  // Assert
  expect(props.onSelectTier).toHaveBeenCalledWith("fast");
});

test("a preset the harness cannot satisfy falls back rather than refusing the run", async () => {
  // Arrange
  served(roster({ options: [modelOption({ id: "", label: "Auto", origin: "auto" })] }));

  // Act
  render(<EngineModelPicker {...pickerProps({ tier: "deep" })} />);

  // Assert
  await waitFor(() => expect(screen.getByText(/falls back to/)).toBeTruthy());
});

test("the exact-model roster stays behind a disclosure", async () => {
  // Arrange
  served(CLAUDE_ROSTER);

  // Act
  render(<EngineModelPicker {...pickerProps()} />);

  // Assert
  await waitFor(() => expect(screen.getByText(REVEAL_ROSTER)).toBeTruthy());
  expect(screen.queryByTestId("model-select")).toBeNull();
});

test("revealing the roster groups verified entries apart from guesses", async () => {
  // Arrange
  served(CLAUDE_ROSTER);
  render(<EngineModelPicker {...pickerProps()} />);
  await screen.findByText(REVEAL_ROSTER);

  // Act
  fireEvent.click(screen.getByText(REVEAL_ROSTER));

  // Assert
  expect(screen.getByRole("group", { name: /checked 2026-08-07/ })).toBeTruthy();
});

test("picking an exact model reports the id the harness will be given", async () => {
  // Arrange
  served(CLAUDE_ROSTER);
  const props = pickerProps();
  render(<EngineModelPicker {...props} />);
  await screen.findByText(REVEAL_ROSTER);
  fireEvent.click(screen.getByText(REVEAL_ROSTER));

  // Act
  fireEvent.change(screen.getByTestId("model-select"), { target: { value: "opus" } });

  // Assert
  expect(props.onSelectModel).toHaveBeenCalledWith("opus");
});

test("a pinned model the harness no longer offers is called out as a run that will be refused", async () => {
  // Arrange
  served(CLAUDE_ROSTER);

  // Act
  render(<EngineModelPicker {...pickerProps({ modelOverride: "claude-opus-4-8" })} />);

  // Assert
  await waitFor(() => expect(screen.getByText(/no longer offered for this harness/)).toBeTruthy());
});

test("a roster that cannot be reached says so rather than showing a resolution it did not check", async () => {
  // Arrange
  fetchModels.mockRejectedValue(new Error("offline"));

  // Act
  render(<EngineModelPicker {...pickerProps()} />);

  // Assert
  await waitFor(() => expect(screen.getByText(/Model list unavailable/)).toBeTruthy());
});

test("a re-check asks the server to probe the harness again", async () => {
  // Arrange
  served(CLAUDE_ROSTER);

  // Act
  render(<EngineModelPicker {...pickerProps({ refreshKey: 1 })} />);

  // Assert
  await waitFor(() => expect(fetchModels).toHaveBeenCalledWith("claude-code", true));
});

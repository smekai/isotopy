// Component test: Setup → Agents is where an owner sees who the Orchestrator can put
// on a team, and whether each one ships with Isotopy or came with the project.
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { AgentsSection } from "../../src/components/setup/AgentsSection";
import type { AgentsSectionProps } from "../../src/components/setup/AgentsSection";
import { DIRS } from "../../src/theme";
import { agentCatalog, catalogAgent, catalogStep } from "../support/agent-fixtures";

afterEach(() => {
  cleanup();
});

test("an agent the project brings shows its title, glyph, id and that the project brought it", () => {
  // Arrange
  const catalog = agentCatalog({ agents: [catalogAgent()] });

  // Act
  render(<AgentsSection {...agentsProps({ catalog })} />);

  // Assert
  const card = screen.getByTestId("agent-growth-marketer");
  expect(card.textContent).toContain("Growth Marketer");
  expect(card.textContent).toContain("✶");
  expect(card.textContent).toContain("growth-marketer");
  expect(card.textContent).toContain("PROJECT");
});

test("a step is listed with where it came from, so a replaced built-in is visible", () => {
  // Arrange
  const catalog = agentCatalog({ steps: [catalogStep({ id: "plan-feature", origin: "project" })] });

  // Act
  render(<AgentsSection {...agentsProps({ catalog })} />);

  // Assert
  expect(screen.getByTestId("step-plan-feature").textContent).toContain("PROJECT");
});

test("a catalog that failed to load says why rather than showing an empty team", () => {
  // Arrange
  const catalog = agentCatalog({ agents: [], steps: [], error: "Failed to load the agents" });

  // Act
  render(<AgentsSection {...agentsProps({ catalog })} />);

  // Assert
  expect(screen.getByText("Failed to load the agents")).toBeTruthy();
});

function agentsProps(overrides: Partial<AgentsSectionProps> = {}): AgentsSectionProps {
  return {
    d: overrides.d ?? DIRS.indigo,
    catalog: overrides.catalog ?? agentCatalog(),
  };
}

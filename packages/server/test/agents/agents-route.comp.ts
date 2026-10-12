// `GET /agents` is the catalog as the browser sees it: every agent and composable
// step for the project the request names, and nothing another project brought.
import path from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import type { AgentCatalogEntry } from "@isotopy/core";
import { writeProjectAgent } from "../support/agent-files.ts";
import { addTestProject, createTestApp, get } from "../support/harness.ts";
import type { TestApp } from "../support/harness.ts";

let ctx: TestApp;

beforeEach(async () => {
  ctx = await createTestApp();
});

afterEach(async () => {
  await ctx.dispose();
});

test("the catalog lists an agent the project brings with its title, glyph and origin", async () => {
  // Arrange
  const project = await addTestProject(ctx.registry, "brings");
  await writeProjectAgent(path.join(project.root, ".isotopy"));

  // Act
  const { body } = await get<AgentCatalogEntry[]>(ctx.app, "/agents", project.headers);

  // Assert
  expect(body).toContainEqual({
    kind: "agent",
    id: "growth-marketer",
    title: "Growth Marketer",
    glyph: "✶",
    description: "Finds the people a product is for.",
    origin: "project",
  });
});

test("an agent one project brings is not in another project's catalog", async () => {
  // Arrange
  const brings = await addTestProject(ctx.registry, "brings");
  const other = await addTestProject(ctx.registry, "other");
  await writeProjectAgent(path.join(brings.root, ".isotopy"));

  // Act
  const { body } = await get<AgentCatalogEntry[]>(ctx.app, "/agents", other.headers);

  // Assert
  expect(body.map((entry) => entry.id)).not.toContain("growth-marketer");
});

test("the Orchestrator's own assignments are not offered as steps a team may take", async () => {
  // Act
  const { body } = await get<AgentCatalogEntry[]>(ctx.app, "/agents");

  // Assert
  expect(body.filter((entry) => entry.kind === "step").map((entry) => entry.id)).not.toContain(
    "orchestrate",
  );
});

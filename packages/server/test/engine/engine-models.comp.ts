// A roster is what Setup offers and what a run is checked against, so both go
// through this route. These tests drive it over the real service and merge, with
// the engine itself scripted — the one thing a component test must never spawn.
import { afterEach, beforeEach, expect, test } from "vitest";
import type { EngineModelRoster } from "@adhd/core";
import { createTestApp, get } from "../support/harness.ts";
import type { TestApp } from "../support/harness.ts";

let ctx: TestApp;

beforeEach(async () => {
  ctx = await createTestApp({ engineId: "cursor" });
});

afterEach(async () => {
  await ctx.dispose();
});

function originOf(roster: EngineModelRoster, id: string): string | undefined {
  return roster.options.find((option) => option.id === id)?.origin;
}

test("an engine that can list nothing still offers the built-in models, marked unverified", async () => {
  // Act
  const { body } = await get<EngineModelRoster>(ctx.app, "/engines/cursor/models");

  // Assert
  expect(originOf(body, "composer-2.5")).toBe("static");
});

test("the built-in list says when it was last checked", async () => {
  // Act
  const { body } = await get<EngineModelRoster>(ctx.app, "/engines/cursor/models");

  // Assert
  expect(body.staticCheckedOn).toBe("2026-08-07");
});

test("models the CLI lists lead the roster and count as verified", async () => {
  // Arrange
  ctx.engine.offersLiveModels([{ id: "composer-3", label: "Composer 3", hint: "" }]);

  // Act
  const { body } = await get<EngineModelRoster>(ctx.app, "/engines/cursor/models");

  // Assert
  expect(body.options[1]).toEqual({ id: "composer-3", label: "Composer 3", hint: "", origin: "live" });
});

test("the model the CLI's own config names counts as verified", async () => {
  // Arrange
  ctx.engine.hasConfiguredModel({ id: "composer-2.5", label: "composer-2.5", hint: "from your config" });

  // Act
  const { body } = await get<EngineModelRoster>(ctx.app, "/engines/cursor/models");

  // Assert
  expect(originOf(body, "composer-2.5")).toBe("config");
});

test("a model lookup that fails falls back to the built-in list and says why", async () => {
  // Arrange
  ctx.engine.failsLiveModels("agent: command not found");

  // Act
  const { body } = await get<EngineModelRoster>(ctx.app, "/engines/cursor/models");

  // Assert
  expect(body.note).toContain("agent: command not found");
});

test("a second read is served from the cache rather than probing the CLI again", async () => {
  // Arrange
  await get<EngineModelRoster>(ctx.app, "/engines/cursor/models");

  // Act
  await get<EngineModelRoster>(ctx.app, "/engines/cursor/models");

  // Assert
  expect(ctx.engine.liveModelLookups).toBe(1);
});

test("a re-check probes the CLI again", async () => {
  // Arrange
  await get<EngineModelRoster>(ctx.app, "/engines/cursor/models");

  // Act
  await get<EngineModelRoster>(ctx.app, "/engines/cursor/models?refresh=1");

  // Assert
  expect(ctx.engine.liveModelLookups).toBe(2);
});

test("an unknown engine is refused", async () => {
  // Act
  const { status } = await get(ctx.app, "/engines/nonsense/models");

  // Assert
  expect(status).toBe(400);
});

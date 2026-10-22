// A roster is what Setup offers and what a run is checked against, so both go
// through this route. These tests drive it over the real service and merge, with
// the engine itself scripted — the one thing a component test must never spawn.
import { afterEach, assert, beforeEach, expect, test } from "vitest";
import { staticModelsFor, tierLadderFor } from "@isotopy/core";
import type { EngineModelRoster } from "@isotopy/core";
import { addTestProject, createTestApp, get, startRun, waitForRunStatus } from "../support/harness.ts";
import type { TestApp } from "../support/harness.ts";

const TASK = "add a greet function";

// Every id an earlier built-in Cursor list offered and the CLI still lists: a user
// may have pinned any of them, and with no live listing the built-in list is all a
// run is checked against.
const PREVIOUSLY_BUNDLED_CURSOR_IDS = [
  "gpt-5.3-codex",
  "gpt-5.2",
  "claude-opus-5-thinking-high",
  "claude-opus-5-thinking-xhigh",
  "claude-sonnet-5-thinking-high",
  "cursor-grok-4.5-high",
];

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
  expect(body.staticCheckedOn).toBe(staticModelsFor("cursor").checkedOn);
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

test("a preset takes its fallback when the CLI's own list leaves out the first choice, even though the built-in list names it", async () => {
  // Arrange — an account without the newest generation lists only the older id.
  const [preferred, fallback] = tierLadderFor("cursor", "deep");
  assert(preferred && fallback, "the Deep ladder has a first choice and a fallback");
  expect(
    staticModelsFor("cursor").options.map((option) => option.id),
    "the built-in list names the first choice",
  ).toContain(preferred.model);
  const project = await addTestProject(ctx.registry, "live-fallback");
  ctx.engine.offersLiveModels([{ id: fallback.model, label: fallback.model, hint: "" }]);

  // Anticipate
  ctx.engine.anticipate({ as: "Agent", model: fallback.model }).reports("Done.");
  ctx.engine.anticipateRunReview();

  // Act
  const run = await startRun(
    ctx.app,
    { pipelineId: "solo", task: TASK, engine: "cursor", modelTier: "deep" },
    project.headers,
  );

  // Assert
  await waitForRunStatus(ctx.app, run.id, "completed");
  ctx.engine.verify();
});

test.each(PREVIOUSLY_BUNDLED_CURSOR_IDS)(
  "a Cursor pin an earlier built-in list offered (%s) still runs when the CLI cannot list models",
  async (model) => {
    // Arrange
    const project = await addTestProject(ctx.registry, "previously-bundled-pin");
    ctx.engine.failsLiveModels("agent: command not found");

    // Anticipate
    ctx.engine.anticipate({ as: "Agent", model }).reports("Done.");
    ctx.engine.anticipateRunReview();

    // Act
    const run = await startRun(
      ctx.app,
      { pipelineId: "solo", task: TASK, engine: "cursor", model },
      project.headers,
    );

    // Assert
    await waitForRunStatus(ctx.app, run.id, "completed");
    ctx.engine.verify();
  },
);

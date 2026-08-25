// Project preferences are server state (TASK-065): what one browser sets, every
// other browser — and the next server process — must see. These tests drive the
// same API the UI does, so "another browser" is a second app over the same
// ISOTOPY_USER_HOME.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { defaultProjectPreferences } from "@isotopy/core";
import type { SettingsView } from "@isotopy/core";
import {
  addTestProject,
  createTestApp,
  get,
  put,
  restartApp,
} from "./support/harness.ts";
import type { TestApp } from "./support/harness.ts";

let ctx: TestApp;

beforeEach(async () => {
  ctx = await createTestApp();
});

afterEach(async () => {
  await ctx.dispose();
});

async function writeUserSettings(userHome: string, contents: unknown): Promise<void> {
  await mkdir(userHome, { recursive: true });
  await writeFile(path.join(userHome, "settings.json"), JSON.stringify(contents), "utf8");
}

test("a project with nothing stored reports the built-in defaults", async () => {
  // Act
  const { body } = await get<SettingsView>(ctx.app, "/settings");

  // Assert
  expect(body.preferences).toEqual(defaultProjectPreferences());
});

test("a preference set through the API is visible to a second server over the same user home", async () => {
  // Arrange — one browser stores its choices.
  await put<SettingsView>(ctx.app, "/settings/preferences", {
    engine: "codex",
    engineModels: { codex: "gpt-5.1-codex-max" },
    permissionMode: "acceptEdits",
    pipelineId: "solo",
  });
  const { app, shutdown } = await restartApp();

  // Act — another browser, another process, no localStorage in sight.
  const { body } = await get<SettingsView>(app, "/settings");

  // Assert
  expect(body.preferences).toEqual({
    engine: "codex",
    modelTier: defaultProjectPreferences().modelTier,
    engineModels: { codex: "gpt-5.1-codex-max" },
    permissionMode: "acceptEdits",
    pipelineId: "solo",
    gates: {},
    builtInSchedules: false,
  });
  await shutdown();
});

test("an update touches only the fields it carries", async () => {
  // Arrange
  await put<SettingsView>(ctx.app, "/settings/preferences", {
    engine: "codex",
    engineModels: { codex: "gpt-5.1-codex-max" },
  });

  // Act
  const { body } = await put<SettingsView>(ctx.app, "/settings/preferences", {
    pipelineId: "pm-dev-test",
  });

  // Assert
  expect(body.preferences.engine).toBe("codex");
  expect(body.preferences.engineModels).toEqual({ codex: "gpt-5.1-codex-max" });
  expect(body.preferences.pipelineId).toBe("pm-dev-test");
});

test("a pinned model for one engine does not disturb another engine's", async () => {
  // Arrange
  await put<SettingsView>(ctx.app, "/settings/preferences", {
    engineModels: { cursor: "composer-9" },
  });

  // Act
  const { body } = await put<SettingsView>(ctx.app, "/settings/preferences", {
    engineModels: { codex: "gpt-5.1-codex-max" },
  });

  // Assert
  expect(body.preferences.engineModels).toEqual({
    cursor: "composer-9",
    codex: "gpt-5.1-codex-max",
  });
});

test("pinning a model the presets already cover adopts the preset instead", async () => {
  // Act
  const { body } = await put<SettingsView>(ctx.app, "/settings/preferences", {
    engineModels: { "claude-code": "opus" },
  });

  // Assert
  expect(body.preferences.modelTier).toBe("deep");
  expect(body.preferences.engineModels).toEqual({});
});

test("choosing a preset releases the pinned model", async () => {
  // Arrange
  await put<SettingsView>(ctx.app, "/settings/preferences", {
    engineModels: { "claude-code": "claude-3-legacy" },
  });

  // Act
  const { body } = await put<SettingsView>(ctx.app, "/settings/preferences", {
    modelTier: "fast",
    engineModels: { "claude-code": null },
  });

  // Assert
  expect(body.preferences.modelTier).toBe("fast");
  expect(body.preferences.engineModels).toEqual({});
});

test("preferences do not cross projects", async () => {
  // Arrange
  const alpha = await addTestProject(ctx.registry, "alpha");
  await put<SettingsView>(ctx.app, "/settings/preferences", { pipelineId: "solo" }, alpha.headers);
  const beta = await addTestProject(ctx.registry, "beta");

  // Act
  const { body } = await get<SettingsView>(ctx.app, "/settings", beta.headers);

  // Assert
  expect(body.preferences.pipelineId).toBe(defaultProjectPreferences().pipelineId);
});

test("a legacy model id stored on disk is migrated on read, onto the preset that covers it", async () => {
  // Arrange — what a browser wrote before the aliases landed.
  await writeUserSettings(ctx.userHome, {
    version: 1,
    defaults: { engines: {} },
    projects: { home: { engines: {}, preferences: { engineModels: { "claude-code": "claude-sonnet-4-6" } } } },
  });

  // Act
  const { body } = await get<SettingsView>(ctx.app, "/settings");

  // Assert
  expect(body.preferences.modelTier).toBe("balanced");
  expect(body.preferences.engineModels).toEqual({});
});

test("an unknown engine is rejected and nothing is stored", async () => {
  // Act
  const { status, body } = await put<{
    error: string;
    issues: { path: (string | number)[]; message: string }[];
  }>(ctx.app, "/settings/preferences", { engine: "gemini" });

  // Assert
  expect(status).toBe(400);
  expect(body.error).toBe("Invalid request");
  expect(body.issues[0]).toMatchObject({ path: ["engine"] });
});

test("an unknown pipeline is rejected", async () => {
  // Act
  const { status } = await put(ctx.app, "/settings/preferences", { pipelineId: "no-such" });

  // Assert
  expect(status).toBe(400);
});

test("an unknown permission mode is rejected", async () => {
  // Act
  const { status } = await put(ctx.app, "/settings/preferences", { permissionMode: "yolo" });

  // Assert
  expect(status).toBe(400);
});

test("storing preferences leaves the engine connection untouched", async () => {
  // Arrange
  await put<SettingsView>(ctx.app, "/settings/engines/claude-code", { apiKey: "sk-ant-test" });

  // Act
  const { body } = await put<SettingsView>(ctx.app, "/settings/preferences", { engine: "codex" });

  // Assert
  expect(body.engines["claude-code"]?.apiKeyConfigured).toBe(true);
});

test("a gate override survives a restart, because a gate is server state like every other preference", async () => {
  // Arrange
  await put(ctx.app, "/settings/preferences", { gates: { "pm-dev-test:intake": false } });
  await ctx.orchestrator.shutdown();

  // Act
  const restarted = await restartApp();

  // Assert
  const { body } = await get<SettingsView>(restarted.app, "/settings");
  expect(body.preferences.gates).toEqual({ "pm-dev-test:intake": false });
  await restarted.shutdown();
}, 15_000);

test("gate overrides do not cross projects", async () => {
  // Arrange
  const other = await addTestProject(ctx.registry, "gates-other");

  // Act
  await put(ctx.app, "/settings/preferences", { gates: { "pm-dev-test:intake": false } });

  // Assert
  const { body } = await get<SettingsView>(ctx.app, "/settings", other.headers);
  expect(body.preferences.gates).toEqual({});
});

test("clearing a gate override with null returns the stage to what the pipeline ships", async () => {
  // Arrange
  await put(ctx.app, "/settings/preferences", { gates: { "pm-dev-test:intake": false } });

  // Act
  await put(ctx.app, "/settings/preferences", { gates: { "pm-dev-test:intake": null } });

  // Assert
  const { body } = await get<SettingsView>(ctx.app, "/settings");
  expect(body.preferences.gates).toEqual({});
});

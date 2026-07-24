// Project preferences are server state (TASK-065): what one browser sets, every
// other browser — and the next server process — must see. These tests drive the
// same API the UI does, so "another browser" is a second app over the same
// ADHD_USER_HOME.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { defaultProjectPreferences } from "@adhd/core";
import type { SettingsView } from "@adhd/core";
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
    pipelineId: "one-box",
    disabledStages: ["review"],
  });
  const { app } = await restartApp();

  // Act — another browser, another process, no localStorage in sight.
  const { body } = await get<SettingsView>(app, "/settings");

  // Assert
  expect(body.preferences).toEqual({
    engine: "codex",
    engineModels: { codex: "gpt-5.1-codex-max" },
    permissionMode: "acceptEdits",
    pipelineId: "one-box",
    disabledStages: ["review"],
  });
});

test("an update touches only the fields it carries", async () => {
  // Arrange
  await put<SettingsView>(ctx.app, "/settings/preferences", {
    engine: "codex",
    engineModels: { "claude-code": "opus" },
  });

  // Act
  const { body } = await put<SettingsView>(ctx.app, "/settings/preferences", {
    pipelineId: "dev-test",
  });

  // Assert
  expect(body.preferences.engine).toBe("codex");
  expect(body.preferences.engineModels).toEqual({ "claude-code": "opus" });
  expect(body.preferences.pipelineId).toBe("dev-test");
});

test("a model stored for one engine does not disturb another engine's model", async () => {
  // Arrange
  await put<SettingsView>(ctx.app, "/settings/preferences", {
    engineModels: { "claude-code": "opus" },
  });

  // Act
  const { body } = await put<SettingsView>(ctx.app, "/settings/preferences", {
    engineModels: { codex: "gpt-5.1-codex-max" },
  });

  // Assert
  expect(body.preferences.engineModels).toEqual({
    "claude-code": "opus",
    codex: "gpt-5.1-codex-max",
  });
});

test("preferences do not cross projects", async () => {
  // Arrange
  const alpha = await addTestProject(ctx.registry, "alpha");
  await put<SettingsView>(ctx.app, "/settings/preferences", { pipelineId: "one-box" }, alpha.headers);
  const beta = await addTestProject(ctx.registry, "beta");

  // Act
  const { body } = await get<SettingsView>(ctx.app, "/settings", beta.headers);

  // Assert
  expect(body.preferences.pipelineId).toBe(defaultProjectPreferences().pipelineId);
});

test("a legacy model id stored on disk is migrated on read", async () => {
  // Arrange — what a browser wrote before the aliases landed.
  await writeUserSettings(ctx.userHome, {
    version: 1,
    defaults: { engines: {} },
    projects: { home: { engines: {}, preferences: { engineModels: { "claude-code": "claude-sonnet-4-6" } } } },
  });

  // Act
  const { body } = await get<SettingsView>(ctx.app, "/settings");

  // Assert
  expect(body.preferences.engineModels["claude-code"]).toBe("sonnet");
});

test("an unknown engine is rejected and nothing is stored", async () => {
  // Act
  const { status, body } = await put<{ error: string }>(ctx.app, "/settings/preferences", {
    engine: "gemini",
  });

  // Assert
  expect(status).toBe(400);
  expect(body.error).toContain("gemini");
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

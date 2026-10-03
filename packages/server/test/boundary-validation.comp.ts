import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { defaultProjectPreferences } from "@isotopy/core";
import type { ProjectsView, SettingsView } from "@isotopy/core";
import type { InvalidInput } from "../src/domain/validation.ts";
import {
  createTestApp,
  get,
  restartApp,
} from "./support/harness.ts";
import type { TestApp } from "./support/harness.ts";

let ctx: TestApp;

beforeEach(async () => {
  ctx = await createTestApp();
});

afterEach(async () => {
  vi.restoreAllMocks();
  await ctx.dispose();
});


test("malformed request JSON returns the shared path-aware error shape", async () => {
  // Act
  const response = await rawJsonRequest("/runs", "{");

  // Assert
  expect(response).toEqual({
    status: 400,
    value: {
      error: "Invalid request",
      issues: [{ path: [], message: "Request body must be valid JSON" }],
    },
  });
});

test("nested type errors are rejected instead of being partially accepted", async () => {
  // Act
  const response = await rawJsonRequest(
    "/runs",
    JSON.stringify({
      pipelineId: "solo",
      sourceTaskIds: ["TASK-098", 7],
    }),
  );

  // Assert
  expect(response.status).toBe(400);
  expect(response.value).toMatchObject({
    error: "Invalid request",
    issues: [{ path: ["sourceTaskIds", 1] }],
  });
});

test("unknown request fields are rejected at the HTTP boundary", async () => {
  // Act
  const response = await rawJsonRequest(
    "/projects",
    JSON.stringify({ root: ctx.home, workspaceDir: ctx.userHome }),
  );

  // Assert
  expect(response.status).toBe(400);
  expect(response.value.error).toBe("Invalid request");
  expect(response.value.issues[0]?.message).toContain("workspaceDir");
});

test("an invalid settings record is ignored as a whole and left untouched", async () => {
  // Arrange — a settings file whose project preferences carry a bad model map.
  const settingsPath = path.join(ctx.userHome, "settings.json");
  const contents = JSON.stringify({
    version: 1,
    defaults: {
      engines: {},
      preferences: { engine: "codex" },
    },
    projects: {
      home: {
        engines: {},
        preferences: { engineModels: { codex: 7 } },
      },
    },
  });
  await writeFile(settingsPath, contents, "utf8");

  // Act
  const { app, shutdown, logger } = await restartApp();

  // Assert — the record is dropped whole, never salvaged field by field.
  const { body } = await get<SettingsView>(app, "/settings");
  expect(body.preferences).toEqual(defaultProjectPreferences());
  expect(await readFile(settingsPath, "utf8")).toBe(contents);
  expect(logger.at("warn")).toContainEqual(
    expect.objectContaining({ message: expect.stringContaining("projects.home") }),
  );
  await shutdown();
});

test("an invalid project registry is ignored as a whole and left untouched", async () => {
  // Arrange — one valid project alongside one whose id is the wrong type.
  const registryPath = path.join(ctx.userHome, "projects.json");
  const contents = JSON.stringify({
    version: 1,
    activeProjectId: "broken",
    projects: [
      {
        id: "valid-looking",
        name: "Valid looking",
        root: ctx.home,
        createdAt: "2026-07-29T00:00:00.000Z",
      },
      { id: 7, name: "Broken", root: ctx.home },
    ],
  });
  await mkdir(ctx.userHome, { recursive: true });
  await writeFile(registryPath, contents, "utf8");

  // Act
  const { app, shutdown, logger } = await restartApp();

  // Assert — the malformed entry takes only itself down, and the file is intact.
  const { body } = await get<ProjectsView>(app, "/projects");
  expect(body.projects).toHaveLength(1);
  expect(body.activeProjectId).toBe("home");
  expect(await readFile(registryPath, "utf8")).toBe(contents);
  expect(logger.at("warn")).toContainEqual(
    expect.objectContaining({ message: expect.stringContaining("projects.1.id") }),
  );
  await shutdown();
});

test("a missing settings file is the defaults, so reading it reports nothing", async () => {
  // Act
  const { status } = await get<SettingsView>(ctx.app, "/settings");

  // Assert
  expect(status).toBe(200);
  expect(ctx.logger.entries).toEqual([]);
});

test("a settings file that exists but cannot be read fails loudly instead of reading as defaults", async () => {
  // Arrange — a directory where the file belongs makes every read fail. Reading
  // it as defaults is what let the next write replace the user's stored keys.
  const settingsPath = path.join(ctx.userHome, "settings.json");
  await mkdir(settingsPath, { recursive: true });

  // Act
  const { status, body } = await get<{ error: string }>(ctx.app, "/settings");

  // Assert
  expect(status).toBe(500);
  expect(body.error).toContain(settingsPath);
  expect(ctx.logger.at("error")).toEqual([
    expect.objectContaining({ message: expect.stringContaining("/settings") }),
  ]);
});

test("a project registry that cannot be read stops the server rather than starting without its projects", async () => {
  // Arrange
  await mkdir(path.join(ctx.userHome, "projects.json"), { recursive: true });

  // Act
  const restarting = restartApp();

  // Assert
  await expect(restarting).rejects.toThrow(/projects\.json/);
});

async function rawJsonRequest(
  route: string,
  body: string,
): Promise<{ status: number; value: InvalidInput }> {
  const response = await ctx.app.request(route, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  return { status: response.status, value: await response.json() };
}

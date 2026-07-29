import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { defaultProjectPreferences } from "@adhd/core";
import type { ProjectsView, SettingsView } from "@adhd/core";
import { boardConfigSchema } from "../src/domain/task-board-config.ts";
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

test("malformed request JSON returns the shared path-aware error shape", async () => {
  const response = await rawJsonRequest("/runs", "{");

  expect(response).toEqual({
    status: 400,
    value: {
      error: "Invalid request",
      issues: [{ path: [], message: "Request body must be valid JSON" }],
    },
  });
});

test("nested type errors are rejected instead of being partially accepted", async () => {
  const response = await rawJsonRequest(
    "/runs",
    JSON.stringify({
      pipelineId: "solo",
      sourceTaskIds: ["TASK-098", 7],
    }),
  );

  expect(response.status).toBe(400);
  expect(response.value).toMatchObject({
    error: "Invalid request",
    issues: [{ path: ["sourceTaskIds", 1] }],
  });
});

test("unknown request fields are rejected at the HTTP boundary", async () => {
  const response = await rawJsonRequest(
    "/projects",
    JSON.stringify({ root: ctx.home, workspaceDir: ctx.userHome }),
  );

  expect(response.status).toBe(400);
  expect(response.value.error).toBe("Invalid request");
  expect(response.value.issues[0]?.message).toContain("workspaceDir");
});

test("an invalid settings record is ignored as a whole and left untouched", async () => {
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
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

  const { app, orchestrator } = await restartApp();
  const { body } = await get<SettingsView>(app, "/settings");

  expect(body.preferences).toEqual(defaultProjectPreferences());
  expect(await readFile(settingsPath, "utf8")).toBe(contents);
  expect(warn).toHaveBeenCalledWith(expect.stringContaining("projects.home"));
  await orchestrator.shutdown();
});

test("an invalid project registry is ignored as a whole and left untouched", async () => {
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
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

  const { app, orchestrator } = await restartApp();
  const { body } = await get<ProjectsView>(app, "/projects");

  expect(body.projects).toHaveLength(1);
  expect(body.activeProjectId).toBe("home");
  expect(await readFile(registryPath, "utf8")).toBe(contents);
  expect(warn).toHaveBeenCalledWith(expect.stringContaining("projects.1.id"));
  await orchestrator.shutdown();
});

test("TaskPlanner config validates consumed fields and preserves plugin fields", () => {
  const parsed = boardConfigSchema.parse({
    version: 2,
    idPrefix: "TASK",
    nextId: 99,
    states: [
      {
        name: "Backlog",
        fileName: "BACKLOG.md",
        order: 0,
      },
    ],
    pluginSpecific: { enabled: true },
  });

  expect(parsed.states[0]).toMatchObject({
    name: "Backlog",
    fileName: "BACKLOG.md",
    order: 0,
  });
  expect(parsed).toMatchObject({ pluginSpecific: { enabled: true } });
});

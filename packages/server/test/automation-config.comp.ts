import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import {
  EMPTY_AUTOMATION_CONFIG,
} from "@adhd/core";
import type { ProjectAutomationConfig } from "@adhd/core";
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

function command(executable = "pnpm"): ProjectAutomationConfig["preview"] {
  return {
    provider: "custom",
    command: {
      executable,
      args: ["run", "deploy"],
      cwd: "apps/web",
      timeoutMs: 120_000,
      windows: { executable: `${executable}.cmd`, args: ["run", "deploy"] },
      posix: null,
    },
    url: "https://preview.example.test",
    healthUrl: "https://preview.example.test/health",
    healthTimeoutMs: 30_000,
    healthIntervalMs: 500,
    rollbackNotes: "Redeploy the previous release.",
  };
}

function config(): ProjectAutomationConfig {
  return {
    ...structuredClone(EMPTY_AUTOMATION_CONFIG),
    validation: [
      {
        id: "typecheck",
        label: "TypeScript",
        command: {
          executable: "pnpm",
          args: ["typecheck"],
          cwd: null,
          timeoutMs: 60_000,
          windows: { executable: "pnpm.cmd", args: ["typecheck"] },
          posix: null,
        },
      },
    ],
    preview: command(),
  };
}

test("a project without automation configuration reports explicit empty defaults", async () => {
  // Act
  const { status, body } = await get<ProjectAutomationConfig>(ctx.app, "/automation");

  // Assert
  expect(status).toBe(200);
  expect(body).toEqual(EMPTY_AUTOMATION_CONFIG);
});

test("automation configuration survives a server restart", async () => {
  // Arrange
  await put(ctx.app, "/automation", config());
  const restarted = await restartApp();

  // Act
  const { body } = await get<ProjectAutomationConfig>(restarted.app, "/automation");

  // Assert
  expect(body).toEqual(config());
  await restarted.orchestrator.shutdown();
});

test("automation configuration is isolated by project", async () => {
  // Arrange
  const alpha = await addTestProject(ctx.registry, "automation-alpha");
  const beta = await addTestProject(ctx.registry, "automation-beta");
  await put(ctx.app, "/automation", config(), alpha.headers);

  // Act
  const { body } = await get<ProjectAutomationConfig>(
    ctx.app,
    "/automation",
    beta.headers,
  );

  // Assert
  expect(body).toEqual(EMPTY_AUTOMATION_CONFIG);
});

test("invalid nested fields report their exact boundary path", async () => {
  // Arrange
  const input = config();
  input.preview!.command.timeoutMs = 1;

  // Act
  const { status, body } = await put<{
    error: string;
    issues: { path: (string | number)[]; message: string }[];
  }>(ctx.app, "/automation", input);

  // Assert
  expect(status).toBe(400);
  expect(body.error).toBe("Invalid request");
  expect(body.issues).toContainEqual(
    expect.objectContaining({ path: ["preview", "command", "timeoutMs"] }),
  );
});

test.each(["../outside", "nested/../../outside", "C:\\outside", "/outside"])(
  "a command working directory cannot escape the project: %s",
  async (cwd) => {
    // Arrange
    const input = config();
    input.preview!.command.cwd = cwd;

    // Act
    const { status } = await put(ctx.app, "/automation", input);

    // Assert
    expect(status).toBe(400);
  },
);

test("a rejected update leaves the existing file untouched", async () => {
  // Arrange
  await put(ctx.app, "/automation", config());
  const target = path.join(ctx.home, "automation.json");
  const before = await readFile(target, "utf8");
  const input = config();
  input.validation.push({ ...input.validation[0]!, label: "Duplicate" });

  // Act
  const { status } = await put(ctx.app, "/automation", input);

  // Assert
  expect(status).toBe(400);
  expect(await readFile(target, "utf8")).toBe(before);
});

test("a malformed owned file is rejected instead of partially recovered", async () => {
  // Arrange
  await mkdir(ctx.home, { recursive: true });
  await writeFile(
    path.join(ctx.home, "automation.json"),
    JSON.stringify({ ...config(), preview: { provider: "custom" } }),
    "utf8",
  );

  // Act
  const { status, body } = await get<{ error: string }>(ctx.app, "/automation");

  // Assert
  expect(status).toBe(422);
  expect(body.error).toBe("Invalid request");
});

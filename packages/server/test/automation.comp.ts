import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import type {
  DeploymentAutomation,
  DeploymentRecord,
  ProjectAutomationConfig,
  ValidationCommand,
} from "@adhd/core";
import { createTestApp, get, post, put } from "./support/harness.ts";
import type { TestApp } from "./support/harness.ts";
import { startHealthServer } from "./support/health-server.ts";
import type { HealthServer } from "./support/health-server.ts";

const INVALID = { error: "Invalid request" };
const CONFIRMED = { confirmation: "DEPLOY PRODUCTION" };

let ctx: TestApp;
let healthy: HealthServer | undefined;

beforeEach(async () => {
  ctx = await createTestApp();
});

afterEach(async () => {
  await healthy?.close();
  healthy = undefined;
  await ctx.dispose();
});

test("a project with no automation file reads as the empty configuration, not an error", async () => {
  // Act
  const { status, body } = await get<ProjectAutomationConfig>(ctx.app, "/automation");

  // Assert
  expect(status).toBe(200);
  expect(body).toEqual({ version: 1, validation: [] });
});

test("a saved configuration is read back from disk by the next request", async () => {
  // Arrange
  const config = automationConfig({ preview: deploymentTarget() });

  // Act
  await put<ProjectAutomationConfig>(ctx.app, "/automation", config);

  // Assert
  const { body } = await get<ProjectAutomationConfig>(ctx.app, "/automation");
  expect(body.preview?.command.executable).toBe(process.execPath);
});

test("a working directory that escapes the project is refused before anything is spawned", async () => {
  // Arrange
  const target = deploymentTarget();
  const escaping = { ...target, command: { ...target.command, cwd: "../elsewhere" } };

  // Act
  const { status, body } = await put(
    ctx.app,
    "/automation",
    automationConfig({ preview: escaping }),
  );

  // Assert
  expect(status).toBe(400);
  expect(body).toMatchObject(INVALID);
});

test("two validation commands may not share an id, because a report keyed by id would lose one", async () => {
  // Arrange
  const duplicated = [validationCommand("check"), validationCommand("check")];

  // Act
  const { status, body } = await put(
    ctx.app,
    "/automation",
    automationConfig({ validation: duplicated }),
  );

  // Assert
  expect(status).toBe(400);
  expect(body).toMatchObject(INVALID);
});

test("a deployment URL that is not http is refused, so nothing verifies a file:// target", async () => {
  // Arrange
  const target = { ...deploymentTarget(), url: "file:///tmp/site" };

  // Act
  const { status } = await put(ctx.app, "/automation", automationConfig({ preview: target }));

  // Assert
  expect(status).toBe(400);
});

test("production deployment without the literal confirmation is refused", async () => {
  // Arrange
  await put(ctx.app, "/automation", automationConfig({ production: deploymentTarget() }));

  // Act
  const { status } = await post(ctx.app, "/automation/deploy/production", {
    confirmation: "yes",
  });

  // Assert
  expect(status).toBe(400);
});

test("confirming a production deployment nobody configured is a conflict, not a silent success", async () => {
  // Act
  const { status, body } = await post<{ error: string }>(
    ctx.app,
    "/automation/deploy/production",
    CONFIRMED,
  );

  // Assert
  expect(status).toBe(409);
  expect(body.error).toContain("No production deployment target");
});

test("a confirmed production deployment runs the command and records the run's evidence", async () => {
  // Arrange
  await put(ctx.app, "/automation", automationConfig({ production: deploymentTarget() }));

  // Act
  const { status, body } = await post<DeploymentRecord>(
    ctx.app,
    "/automation/deploy/production",
    CONFIRMED,
  );

  // Assert
  expect(status).toBe(200);
  expect(body.result.verdict).toBe("pass");
  const evidence = await readFile(
    path.join(ctx.home, "deployments", body.id, "deployment.json"),
    "utf8",
  );
  expect(JSON.parse(evidence)).toEqual(body.result);
});

test("a command that exits non-zero fails the deployment and answers 502", async () => {
  // Arrange
  const failing = deploymentTarget({
    command: { executable: process.execPath, args: ["-e", "process.exit(3)"], timeoutMs: 30_000 },
  });
  await put(ctx.app, "/automation", automationConfig({ production: failing }));

  // Act
  const { status, body } = await post<DeploymentRecord>(
    ctx.app,
    "/automation/deploy/production",
    CONFIRMED,
  );

  // Assert
  expect(status).toBe(502);
  expect(body.result.verdict).toBe("fail");
  expect(body.result.exitCode).toBe(3);
});

test("the URL a deploy command prints is what gets health-checked", async () => {
  // Arrange
  healthy = await startHealthServer(200);
  await put(
    ctx.app,
    "/automation",
    automationConfig({ production: reportingTarget(healthy.url) }),
  );

  // Act
  const { body } = await post<DeploymentRecord>(
    ctx.app,
    "/automation/deploy/production",
    CONFIRMED,
  );

  // Assert
  expect(body.result.url).toBe(healthy.url);
  expect(body.result.healthStatus).toBe("passed");
  expect(body.result.verdict).toBe("pass");
});

test("a health check the deployment never answers fails it, even though the command succeeded", async () => {
  // Arrange — port 9 is the discard port: reachable syntax, nothing serving.
  const unreachable = deploymentTarget({
    healthUrl: "http://127.0.0.1:9/",
    healthTimeoutMs: 300,
    healthIntervalMs: 100,
  });
  await put(ctx.app, "/automation", automationConfig({ production: unreachable }));

  // Act
  const { body } = await post<DeploymentRecord>(
    ctx.app,
    "/automation/deploy/production",
    CONFIRMED,
  );

  // Assert
  expect(body.result.healthStatus).toBe("failed");
  expect(body.result.verdict).toBe("fail");
});

test("a deployment that reports no URL and configures no health check is judged by its exit code alone", async () => {
  // Arrange
  await put(ctx.app, "/automation", automationConfig({ production: deploymentTarget() }));

  // Act
  const { body } = await post<DeploymentRecord>(
    ctx.app,
    "/automation/deploy/production",
    CONFIRMED,
  );

  // Assert
  expect(body.result.healthStatus).toBe("skipped");
  expect(body.result.verdict).toBe("pass");
});

function automationConfig(
  overrides: Partial<ProjectAutomationConfig> = {},
): ProjectAutomationConfig {
  return {
    version: 1,
    validation: overrides.validation ?? [],
    ...(overrides.ui === undefined ? {} : { ui: overrides.ui }),
    ...(overrides.preview === undefined ? {} : { preview: overrides.preview }),
    ...(overrides.production === undefined ? {} : { production: overrides.production }),
  };
}

function deploymentTarget(
  overrides: Partial<DeploymentAutomation> = {},
): DeploymentAutomation {
  return {
    provider: overrides.provider ?? "custom",
    command: overrides.command ?? {
      executable: process.execPath,
      args: ["-e", "console.log('deployed')"],
      timeoutMs: 30_000,
    },
    healthTimeoutMs: overrides.healthTimeoutMs ?? 1_000,
    healthIntervalMs: overrides.healthIntervalMs ?? 100,
    ...(overrides.url === undefined ? {} : { url: overrides.url }),
    ...(overrides.healthUrl === undefined ? {} : { healthUrl: overrides.healthUrl }),
    ...(overrides.rollbackNotes === undefined ? {} : { rollbackNotes: overrides.rollbackNotes }),
  };
}

function reportingTarget(url: string): DeploymentAutomation {
  return deploymentTarget({
    command: {
      executable: process.execPath,
      args: ["-e", `console.log("ADHD_DEPLOY_URL=${url}")`],
      timeoutMs: 30_000,
    },
    healthTimeoutMs: 2_000,
  });
}

function validationCommand(id: string): ValidationCommand {
  return {
    id,
    label: "Tests",
    command: { executable: process.execPath, args: ["-e", ""], timeoutMs: 30_000 },
  };
}

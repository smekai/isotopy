import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import type {
  AutomationCommand,
  DeploymentAutomation,
  DeploymentRecord,
  ProductionStatus,
  ProjectAutomationConfig,
  ValidationCommand,
} from "@isotopy/core";
import { createTestApp, get, post, put, stageOf, waitForRunStatus } from "./support/harness.ts";
import type { TestApp } from "./support/harness.ts";
import { startHealthServer } from "./support/health-server.ts";
import type { HealthServer } from "./support/health-server.ts";

const INVALID = { error: "Invalid request" };
const CONFIRMED = { confirmation: "DEPLOY PRODUCTION" };
const ROLLBACK_CONFIRMED = { confirmation: "ROLLBACK PRODUCTION" };
const CHECKLIST = "Sign in with the QA account and open /account twice.";

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

test("the commit a deploy command prints is recorded with the deployment", async () => {
  // Arrange
  await put(ctx.app, "/automation", automationConfig({ production: deployingRef("abc1234") }));

  // Act
  const { body } = await post<DeploymentRecord>(ctx.app, "/automation/deploy/production", CONFIRMED);

  // Assert
  expect(body.result.ref).toBe("abc1234");
});

test("a passing deploy with a check configured hands the QA Engineer the live commit and the project's instructions", async () => {
  // Arrange
  await deployedRefs(["old1111"]);
  await put(
    ctx.app,
    "/automation",
    automationConfig({ production: deployingRef("new2222", { verification: { instructions: CHECKLIST } }) }),
  );

  // Anticipate
  ctx.engine
    .anticipate({ as: "QA Engineer", prompt: /new2222[\s\S]*old1111[\s\S]*open \/account twice/ })
    .reports("Everything renders.\n\nVERDICT: PASS");
  ctx.engine.anticipateRunReview();

  // Act
  const { body } = await post<DeploymentRecord>(ctx.app, "/automation/deploy/production", CONFIRMED);

  // Assert
  expect(body.verificationRunId).toBeDefined();
  const checked = await waitForRunStatus(ctx.app, body.verificationRunId ?? "", "completed");
  expect(stageOf(checked, "verify-production").verdict).toBe("PASS");
  const { body: production } = await get<ProductionStatus>(ctx.app, "/automation/production");
  expect(production.verification).toMatchObject({ runId: body.verificationRunId, verdict: "PASS" });
  ctx.engine.verify();
});

test("a deploy without a check configured starts no run", async () => {
  // Arrange
  await put(ctx.app, "/automation", automationConfig({ production: deployingRef("abc1234") }));

  // Anticipate — none: without instructions nothing reaches an engine.

  // Act
  const { body } = await post<DeploymentRecord>(ctx.app, "/automation/deploy/production", CONFIRMED);

  // Assert
  expect(body.verificationRunId).toBeUndefined();
  ctx.engine.verify();
});

test("a failed deploy is not checked, because nothing new went live", async () => {
  // Arrange
  const failing = deploymentTarget({
    command: { executable: process.execPath, args: ["-e", "process.exit(3)"], timeoutMs: 30_000 },
    verification: { instructions: CHECKLIST },
  });
  await put(ctx.app, "/automation", automationConfig({ production: failing }));

  // Anticipate — none: a failed deploy must not start the check.

  // Act
  const { body } = await post<DeploymentRecord>(ctx.app, "/automation/deploy/production", CONFIRMED);

  // Assert
  expect(body.verificationRunId).toBeUndefined();
  ctx.engine.verify();
});

test("a rollback without the literal confirmation is refused", async () => {
  // Arrange
  await deployedRefs(["old1111", "new2222"], { rollback: ECHO_ROLLBACK_REF });

  // Act
  const { status } = await post(ctx.app, "/automation/rollback/production", { confirmation: "yes" });

  // Assert
  expect(status).toBe(400);
});

test("a confirmed rollback redeploys the commit that was live before the latest release", async () => {
  // Arrange
  await deployedRefs(["old1111", "new2222"], { rollback: ECHO_ROLLBACK_REF });

  // Act
  const { status, body } = await post<DeploymentRecord>(
    ctx.app,
    "/automation/rollback/production",
    ROLLBACK_CONFIRMED,
  );

  // Assert
  expect(status).toBe(200);
  expect(body.result).toMatchObject({ kind: "rollback", ref: "old1111", verdict: "pass" });
});

test("a named commit is what the rollback command receives", async () => {
  // Arrange
  await deployedRefs(["old1111", "new2222"], { rollback: ECHO_ROLLBACK_REF });

  // Act
  const { body } = await post<DeploymentRecord>(ctx.app, "/automation/rollback/production", {
    ...ROLLBACK_CONFIRMED,
    ref: "older00",
  });

  // Assert
  expect(body.result.ref).toBe("older00");
});

test("after a rollback no further rollback is offered, so it never proposes going back to the bad release", async () => {
  // Arrange
  await deployedRefs(["old1111", "new2222"], { rollback: ECHO_ROLLBACK_REF });
  await post(ctx.app, "/automation/rollback/production", ROLLBACK_CONFIRMED);

  // Act
  const { body } = await get<ProductionStatus>(ctx.app, "/automation/production");

  // Assert
  expect(body.latest?.result).toMatchObject({ kind: "rollback", ref: "old1111" });
  expect(body.rollbackRef).toBeUndefined();
});

test("a rollback with no rollback command configured is a conflict, not a silent success", async () => {
  // Arrange
  await deployedRefs(["old1111", "new2222"]);

  // Act
  const { status } = await post(ctx.app, "/automation/rollback/production", ROLLBACK_CONFIRMED);

  // Assert
  expect(status).toBe(409);
});

test("an automation file saved with the retired rollback notes still loads, without them", async () => {
  // Arrange
  await mkdir(ctx.home, { recursive: true });
  const saved = automationConfig({ production: deploymentTarget() });
  const withNotes = { ...saved, production: { ...saved.production, rollbackNotes: "Revert on main." } };
  await writeFile(path.join(ctx.home, "automation.json"), JSON.stringify(withNotes));

  // Act
  const { status, body } = await get<ProjectAutomationConfig>(ctx.app, "/automation");

  // Assert
  expect(status).toBe(200);
  expect(body.production).toBeDefined();
  expect(body.production).not.toHaveProperty("rollbackNotes");
});

function automationConfig(
  overrides: Partial<ProjectAutomationConfig> = {},
): ProjectAutomationConfig {
  return {
    ...overrides,
    version: 1,
    validation: overrides.validation ?? [],
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
    url: overrides.url,
    healthUrl: overrides.healthUrl,
    rollback: overrides.rollback,
    verification: overrides.verification,
  };
}

function printing(line: string): AutomationCommand {
  return { executable: process.execPath, args: ["-e", `console.log(${JSON.stringify(line)})`], timeoutMs: 30_000 };
}

function deployingRef(ref: string, overrides: Partial<DeploymentAutomation> = {}): DeploymentAutomation {
  return deploymentTarget({ ...overrides, command: printing(`ISOTOPY_DEPLOY_REF=${ref}`) });
}

const ECHO_ROLLBACK_REF: AutomationCommand = {
  executable: process.execPath,
  args: ["-e", "console.log('ISOTOPY_DEPLOY_REF=' + process.env.ISOTOPY_ROLLBACK_REF)"],
  timeoutMs: 30_000,
};

async function deployedRefs(refs: string[], overrides: Partial<DeploymentAutomation> = {}): Promise<void> {
  for (const ref of refs) {
    await put(ctx.app, "/automation", automationConfig({ production: deployingRef(ref, overrides) }));
    const { status } = await post(ctx.app, "/automation/deploy/production", CONFIRMED);
    expect(status, `deploying ${ref}`).toBe(200);
  }
}

function reportingTarget(url: string): DeploymentAutomation {
  return deploymentTarget({
    command: {
      executable: process.execPath,
      args: ["-e", `console.log("ISOTOPY_DEPLOY_URL=${url}")`],
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

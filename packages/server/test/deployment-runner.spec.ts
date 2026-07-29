import path from "node:path";
import { expect, test, vi } from "vitest";
import type { DeploymentAutomation } from "@adhd/core";
import { DeploymentRunner } from "../src/services/deployment-runner.ts";
import {
  commandForPlatform,
  deploymentUrl,
  deploymentWorkingDirectory,
} from "../src/services/deployment-runner.ts";
import type { SubprocessResult } from "../src/engines/subprocess.ts";

function target(): DeploymentAutomation {
  return {
    provider: "custom",
    command: {
      executable: "deploy",
      args: ["preview"],
      cwd: "apps/web",
      timeoutMs: 10_000,
      windows: { executable: "deploy.cmd", args: ["preview", "--windows"] },
      posix: { executable: "./deploy", args: ["preview", "--posix"] },
    },
    url: "https://fallback.example.test",
    healthUrl: null,
    healthTimeoutMs: 1_000,
    healthIntervalMs: 100,
    rollbackNotes: null,
  };
}

function successfulProcess(stdout = ""): SubprocessResult {
  return {
    success: true,
    exitCode: 0,
    termSignal: null,
    timedOut: false,
    aborted: false,
    stdout,
    stderrTail: [],
    durationMs: 10,
  };
}

test("platform command overrides replace executable and arguments together", () => {
  expect(commandForPlatform(target(), "win32")).toEqual({
    executable: "deploy.cmd",
    args: ["preview", "--windows"],
  });
  expect(commandForPlatform(target(), "darwin")).toEqual({
    executable: "./deploy",
    args: ["preview", "--posix"],
  });
});

test("deployment working directories are resolved inside the project", () => {
  const root = path.resolve("safe-project");
  expect(deploymentWorkingDirectory(root, "apps/web")).toBe(
    path.join(root, "apps", "web"),
  );
  expect(() => deploymentWorkingDirectory(root, "../outside")).toThrow(
    "must stay inside the project",
  );
});

test("the last exact URL marker wins and invalid markers use the configured fallback", () => {
  expect(
    deploymentUrl(
      "ADHD_DEPLOY_URL=https://old.example.test\nADHD_DEPLOY_URL=https://new.example.test",
      null,
    ),
  ).toBe("https://new.example.test/");
  expect(deploymentUrl("ADHD_DEPLOY_URL=javascript:alert(1)", "https://safe.test")).toBe(
    "https://safe.test",
  );
});

test("a successful command is followed by health retries", async () => {
  // Arrange
  const run = vi.fn().mockResolvedValue(
    successfulProcess("ADHD_DEPLOY_URL=https://dynamic.example.test\n"),
  );
  const health = vi
    .fn()
    .mockResolvedValueOnce({ ok: false, status: 503 })
    .mockResolvedValueOnce({ ok: true, status: 200 });
  let now = 0;
  const runner = new DeploymentRunner({
    platform: "linux",
    run,
    fetch: health,
    now: () => new Date(now),
    sleep: async (milliseconds) => {
      now += milliseconds;
    },
  });

  // Act
  const result = await runner.run({
    project: { id: "project", root: path.resolve("project"), dataDir: "unused" },
    environment: "preview",
    target: { ...target(), healthUrl: "https://health.example.test" },
  });

  // Assert
  expect(result).toMatchObject({
    verdict: "pass",
    url: "https://dynamic.example.test/",
    healthUrl: "https://health.example.test",
    healthStatus: "passed",
    failureMessage: null,
  });
  expect(health).toHaveBeenCalledTimes(2);
  expect(run).toHaveBeenCalledWith(
    expect.objectContaining({
      command: "./deploy",
      args: ["preview", "--posix"],
      cwd: path.resolve("project", "apps/web"),
    }),
  );
});

test("a command failure does not perform an unsafe health check", async () => {
  // Arrange
  const health = vi.fn();
  const runner = new DeploymentRunner({
    run: vi.fn().mockResolvedValue({
      ...successfulProcess(),
      success: false,
      exitCode: 1,
      errorMessage: "Deploy failed",
    }),
    fetch: health,
  });

  // Act
  const result = await runner.run({
    project: { id: "project", root: path.resolve("project"), dataDir: "unused" },
    environment: "preview",
    target: target(),
  });

  // Assert
  expect(result).toMatchObject({
    verdict: "fail",
    healthStatus: "skipped",
    failureMessage: "Deploy failed",
  });
  expect(health).not.toHaveBeenCalled();
});

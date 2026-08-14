import path from "node:path";
import { expect, test } from "vitest";
import type { AutomationCommand } from "@isotopy/core";
import {
  commandForPlatform,
  deploymentWorkingDirectory,
  reportedDeploymentUrl,
} from "../src/domain/rules/deployment.ts";

function command(overrides: Partial<AutomationCommand> = {}): AutomationCommand {
  return {
    executable: overrides.executable ?? "npx",
    args: overrides.args ?? ["vercel", "deploy"],
    timeoutMs: overrides.timeoutMs ?? 60_000,
    cwd: overrides.cwd,
    windows: overrides.windows,
    posix: overrides.posix,
  };
}

test("a Windows override replaces the executable that a POSIX shim would resolve", () => {
  const windows = { executable: "npx.cmd", args: ["vercel", "deploy"] };

  expect(commandForPlatform(command({ windows }), "win32")).toEqual(windows);
});

test("a Windows override is ignored on POSIX, where the base executable is the real one", () => {
  const windows = { executable: "npx.cmd", args: ["vercel", "deploy"] };

  expect(commandForPlatform(command({ windows }), "darwin")).toEqual({
    executable: "npx",
    args: ["vercel", "deploy"],
  });
});

test("a command with no override for the running platform falls back to its base form", () => {
  expect(commandForPlatform(command(), "win32")).toEqual({
    executable: "npx",
    args: ["vercel", "deploy"],
  });
});

test("a working directory that climbs out of the project is refused, not resolved", () => {
  expect(() => deploymentWorkingDirectory(path.resolve("/projects/app"), "../other")).toThrow(
    /must stay inside the project/,
  );
});

test("a nested working directory resolves against the project root", () => {
  const root = path.resolve("/projects/app");

  expect(deploymentWorkingDirectory(root, "packages/web")).toBe(
    path.join(root, "packages", "web"),
  );
});

test("the last reported URL wins, because a deploy tool prints its progress before its result", () => {
  const stdout = [
    "ISOTOPY_DEPLOY_URL=https://old.example.test",
    "building…",
    "ISOTOPY_DEPLOY_URL=https://new.example.test",
  ].join("\n");

  expect(reportedDeploymentUrl(stdout)).toBe("https://new.example.test/");
});

test("a marker that is not http keeps the configured URL rather than trusting the output", () => {
  expect(reportedDeploymentUrl("ISOTOPY_DEPLOY_URL=file:///etc/passwd", "https://fixed.test")).toBe(
    "https://fixed.test",
  );
});

test("output with no marker at all keeps the configured URL", () => {
  expect(reportedDeploymentUrl("deployed fine\n", "https://fixed.test")).toBe(
    "https://fixed.test",
  );
});

test("a marker in a CRLF log is read without the carriage return", () => {
  expect(reportedDeploymentUrl("done\r\nISOTOPY_DEPLOY_URL=https://crlf.test\r\n")).toBe(
    "https://crlf.test/",
  );
});

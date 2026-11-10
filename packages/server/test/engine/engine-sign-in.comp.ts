// Component test: does the real Claude Code adapter tell a signed-out CLI from an
// unknown one, and an expired session from a crash? TASK-223 found both wrong on
// a live run: `claude auth status` exits 1 when signed out, so its JSON was never
// read and Setup said "unknown"; and "Failed to authenticate" failed the stage
// instead of waiting on the owner. The stub binary is installed through the
// documented ISOTOPY_CLAUDE_PATH override, so the subprocess harness is real.
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, expect, test } from "vitest";
import { claudeCodeAdapter } from "../../src/engines/claude-code.ts";
import type { EngineRunResult } from "../../src/engines/types.ts";

const PATH_ENV = "ISOTOPY_CLAUDE_PATH";

// What `claude auth status` printed on 2026-11-10 with no session, exiting 1.
const SIGNED_OUT_STATUS = '{"loggedIn": false, "authMethod": "none"}';

// The verbatim failure from TASK-211's Orchestrator turn.
const EXPIRED_SESSION = "Failed to authenticate: OAuth session expired and could not be refreshed";

let stubDir: string;

beforeAll(() => {
  stubDir = mkdtempSync(path.join(os.tmpdir(), "isotopy-sign-in-stub-"));
});

afterAll(() => {
  delete process.env[PATH_ENV];
  rmSync(stubDir, { recursive: true, force: true, maxRetries: 3 });
});

test("a signed-out CLI is reported as logged out even though `auth status` exits non-zero", async () => {
  // Arrange
  process.env[PATH_ENV] = writeStub("claude-status", SIGNED_OUT_STATUS, "stdout");

  // Act
  const status = await claudeCodeAdapter.detect?.();

  // Assert
  expect(status?.installed).toBe(true);
  expect(status?.loggedIn).toBe(false);
});

test("an expired session mid-run is a sign-in wait for the owner, not a plain failure", async () => {
  // Arrange
  process.env[PATH_ENV] = writeStub("claude-expired", EXPIRED_SESSION, "stderr");

  // Act
  const result = await runAdapter();

  // Assert
  expect(result.success).toBe(false);
  expect(result.limit?.cause).toBe("signed-out");
});

function writeStub(name: string, line: string, stream: "stdout" | "stderr"): string {
  const windows = process.platform === "win32";
  const file = path.join(stubDir, windows ? `${name}.cmd` : name);
  const redirect = stream === "stderr" ? (windows ? " 1>&2" : " >&2") : "";
  const body = windows
    ? `@echo off\r\nif "%~1"=="--version" (echo 2.1.302 & exit /b 0)\r\necho ${line}${redirect}\r\nexit /b 1\r\n`
    : `#!/bin/sh\nif [ "$1" = "--version" ]; then echo 2.1.302; exit 0; fi\necho '${line}'${redirect}\nexit 1\n`;
  writeFileSync(file, body);
  if (!windows) {
    chmodSync(file, 0o755);
  }
  return file;
}

function runAdapter(): Promise<EngineRunResult> {
  return claudeCodeAdapter.run({
    runId: "sign-in",
    prompt: "say hello",
    cwd: stubDir,
    permissionMode: "skip",
    connection: { mode: "subscription" },
    toolCacheDir: path.join(stubDir, "cache"),
    timeoutMs: 15_000,
    signal: new AbortController().signal,
    onLog: () => {},
  });
}

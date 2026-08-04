// Component test: does every harness actually park, through its own real
// adapter? `limit-pause.comp.ts` fakes the engine, so it proves the workflow but
// says nothing about whether claude-code/codex/cursor recognise a limit in the
// text their CLI really prints. This runs each adapter against a stub binary
// installed through the documented ADHD_*_PATH override, so the subprocess
// harness, the failure ladder and the detection patterns are all real code.
//
// The stub prints the limit to stderr and exits non-zero, which is the shape all
// three ladders funnel into `detectEngineLimit`.
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { EngineId } from "@adhd/core";
import { claudeCodeAdapter } from "../src/engines/claude-code.ts";
import { codexAdapter } from "../src/engines/codex.ts";
import { cursorAdapter } from "../src/engines/cursor.ts";
import type { EngineAdapter, EngineRunResult } from "../src/engines/types.ts";

// ASCII only: a .cmd stub is read in the console codepage on Windows.
const CLAUDE_LINE = "You've hit your session limit - resets 4:30pm (Europe/Tallinn)";
const CODEX_LINE = "stream error: rate limit reached; try again in 45 minutes";
const CURSOR_LINE = "Usage limit reached - resets at 16:30";

const PATH_ENV: Record<EngineId, string> = {
  "claude-code": "ADHD_CLAUDE_PATH",
  codex: "ADHD_CODEX_PATH",
  cursor: "ADHD_CURSOR_PATH",
};

const ADAPTERS: Record<EngineId, EngineAdapter> = {
  "claude-code": claudeCodeAdapter,
  codex: codexAdapter,
  cursor: cursorAdapter,
};

let stubDir: string;

function writeStub(name: string, line: string): string {
  const windows = process.platform === "win32";
  const file = path.join(stubDir, windows ? `${name}.cmd` : name);
  const body = windows
    ? `@echo off\r\necho ${line} 1>&2\r\nexit /b 1\r\n`
    : `#!/bin/sh\necho "${line}" >&2\nexit 1\n`;
  writeFileSync(file, body);
  if (!windows) {
    chmodSync(file, 0o755);
  }
  return file;
}

function runAdapter(engine: EngineId): Promise<EngineRunResult> {
  return ADAPTERS[engine].run({
    runId: `limit-${engine}`,
    prompt: "say hello",
    cwd: stubDir,
    permissionMode: "skip",
    connection: { mode: "subscription" },
    timeoutMs: 15_000,
    signal: new AbortController().signal,
    onLog: () => {},
  });
}

beforeAll(() => {
  stubDir = mkdtempSync(path.join(os.tmpdir(), "adhd-limit-stub-"));
  process.env[PATH_ENV["claude-code"]] = writeStub("claude", CLAUDE_LINE);
  process.env[PATH_ENV.codex] = writeStub("codex", CODEX_LINE);
  process.env[PATH_ENV.cursor] = writeStub("cursor-agent", CURSOR_LINE);
});

afterAll(() => {
  for (const variable of Object.values(PATH_ENV)) {
    delete process.env[variable];
  }
  rmSync(stubDir, { recursive: true, force: true, maxRetries: 3 });
});

describe("every harness reports a plan limit as a limit", () => {
  test("claude-code recognises its session-limit line and parses the named zone", async () => {
    // Act
    const result = await runAdapter("claude-code");

    // Assert
    expect(result.limit?.raw).toContain("session limit");
    expect(result.limit?.resetAt).toBeDefined();
  });

  test("codex recognises a rate limit and parses the retry delay it prints", async () => {
    // Act
    const result = await runAdapter("codex");

    // Assert
    expect(result.limit?.raw).toContain("rate limit");
    // "try again in 45 minutes" is a duration, so it needs no timezone at all.
    const waitMs = new Date(result.limit?.resetAt ?? 0).getTime() - Date.now();
    expect(waitMs).toBeGreaterThan(44 * 60_000);
    expect(waitMs).toBeLessThanOrEqual(45 * 60_000);
  });

  test("cursor recognises a usage limit and parses a bare 24-hour clock", async () => {
    // Act
    const result = await runAdapter("cursor");

    // Assert
    expect(result.limit?.raw).toContain("Usage limit");
    expect(result.limit?.resetAt).toBeDefined();
  });

  test("an ordinary crash from the same binary is still a plain failure", async () => {
    // Arrange — same binary, same failure ladder, a line that is not a limit.
    writeStub("claude", "Error: ENOENT no such file or directory");

    // Act
    const result = await runAdapter("claude-code");

    // Assert
    expect(result.limit).toBeUndefined();
    expect(result.success).toBe(false);
  });
});

// Component test: which permission flag does each real adapter hand its CLI?
// `permission-plan.spec.ts` proves the rule in isolation; this proves the wiring
// — the probe, the cache, the argv builders and the degradation notice — by
// running each adapter against a stub binary installed through the documented
// ADHD_*_PATH override.
//
// The stub records every argv it is called with and answers `--help` from a
// fixture the test wrote, so a Codex build that advertises auto-review on `exec`
// but not on `exec resume` is something a test can actually arrange.
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import type { EngineId, EnginePermissionMode } from "@adhd/core";
import { claudeCodeAdapter } from "../../src/engines/claude-code.ts";
import { codexAdapter } from "../../src/engines/codex.ts";
import { cursorAdapter } from "../../src/engines/cursor.ts";
import { clearAutoReviewCache } from "../../src/engines/permission-mode.ts";
import type { EngineAdapter } from "../../src/engines/types.ts";
import type { StageLogDraft } from "@adhd/core";

const CLAUDE_HELP_WITH_AUTO = [
  "  --permission-mode <mode>              Permission mode to use for the session",
  '                                        (choices: "acceptEdits", "auto", "plan")',
].join("\n");

const CLAUDE_HELP_WITHOUT_AUTO = [
  "  --permission-mode <mode>              Permission mode to use for the session",
  '                                        (choices: "acceptEdits", "plan")',
].join("\n");

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

const ARGS_FILE = "args.txt";
const HELP_FILE = "help.txt";
const RESUME_HELP_FILE = "help-resume.txt";

let stubDir: string;

// One stub directory for the whole file: each adapter memoises the binary it
// resolved, so a fresh directory per test would leave them pointing at the old one.
beforeAll(() => {
  stubDir = mkdtempSync(path.join(os.tmpdir(), "adhd-permission-stub-"));
  writeStubRunner();
  for (const [engine, variable] of Object.entries(PATH_ENV)) {
    process.env[variable] = installStub(stubName(engine as EngineId));
  }
});

beforeEach(() => {
  clearAutoReviewCache();
  writeFileSync(path.join(stubDir, ARGS_FILE), "");
  writeHelp(HELP_FILE, "");
  writeHelp(RESUME_HELP_FILE, "");
});

afterAll(() => {
  for (const variable of Object.values(PATH_ENV)) {
    delete process.env[variable];
  }
  rmSync(stubDir, { recursive: true, force: true, maxRetries: 3 });
});

describe("claude-code", () => {
  test("asks for the CLI's own auto mode when the CLI advertises one", async () => {
    // Arrange
    writeHelp(HELP_FILE, CLAUDE_HELP_WITH_AUTO);

    // Act
    await runAdapter("claude-code", "autoReview");

    // Assert
    expect(runArgv()).toContain("--permission-mode auto");
  });

  test("a build with no auto mode runs exactly as Never block does", async () => {
    // Arrange
    writeHelp(HELP_FILE, CLAUDE_HELP_WITHOUT_AUTO);

    // Act
    await runAdapter("claude-code", "autoReview");

    // Assert
    expect(runArgv()).toContain("--dangerously-skip-permissions");
    expect(runArgv()).not.toContain("--permission-mode");
  });

  test("a degraded run is never silent", async () => {
    // Arrange
    writeHelp(HELP_FILE, CLAUDE_HELP_WITHOUT_AUTO);

    // Act
    const logs = await runAdapter("claude-code", "autoReview");

    // Assert
    expect(logs.filter((log) => log.level === "info")).toHaveLength(1);
  });

  test("a run that never asked for auto-review never spends a probe on it", async () => {
    // Arrange
    writeHelp(HELP_FILE, CLAUDE_HELP_WITH_AUTO);

    // Act
    await runAdapter("claude-code", "skip");

    // Assert
    expect(recordedArgv()).toHaveLength(1);
  });
});

describe("codex", () => {
  test("routes escalations to Codex's own reviewer instead of denying them", async () => {
    // Act
    await runAdapter("codex", "autoReview");

    // Assert
    expect(runArgv()).toContain('approvals_reviewer="auto_review"');
    expect(runArgv()).toContain('approval_policy="on-request"');
  });

  test("auto-review keeps a real sandbox rather than trading safety for a reviewer", async () => {
    // Act
    await runAdapter("codex", "autoReview");

    // Assert
    expect(runArgv()).toContain("--sandbox workspace-write");
    expect(runArgv()).not.toContain("--dangerously-bypass-approvals-and-sandbox");
  });

  test("a resumed turn still gets a sandbox, which `exec resume` refuses as a flag", async () => {
    // Act
    await runAdapter("codex", "autoReview", "session-42");

    // Assert — `--sandbox` is rejected on resume, so the boundary goes via config.
    expect(runArgv()).toContain('sandbox_mode="workspace-write"');
    expect(runArgv()).not.toContain("--sandbox workspace-write");
  });

  test("a resumed accept-edits turn no longer drops to Codex's default sandbox", async () => {
    // Act
    await runAdapter("codex", "acceptEdits", "session-43");

    // Assert
    expect(runArgv()).toContain('sandbox_mode="workspace-write"');
  });
});

describe("cursor", () => {
  test("keeps running unrestricted, because its Auto-review is a config setting and not a flag", async () => {
    // Act
    const logs = await runAdapter("cursor", "autoReview");

    // Assert
    expect(runArgv()).toContain("--force");
    expect(logs.filter((log) => log.level === "info")).toHaveLength(1);
  });

  test("never reaches for the user's Cursor config to get there", async () => {
    // Act
    await runAdapter("cursor", "autoReview");

    // Assert — the standing rule is that CLI config files are read, never written.
    expect(process.env.CURSOR_CONFIG_DIR).toBeUndefined();
    expect(recordedArgv()).toHaveLength(1);
  });
});

function stubName(engine: EngineId): string {
  return engine === "cursor" ? "cursor-agent" : engine === "codex" ? "codex" : "claude";
}

function writeStubRunner(): void {
  const runner = [
    'const fs = require("node:fs");',
    'const path = require("node:path");',
    "const args = process.argv.slice(2);",
    'fs.appendFileSync(path.join(__dirname, "args.txt"), args.join(" ") + "\\n");',
    'if (args.includes("--help")) {',
    '  const file = args.includes("resume") ? "help-resume.txt" : "help.txt";',
    '  process.stdout.write(fs.readFileSync(path.join(__dirname, file), "utf8"));',
    "  process.exit(0);",
    "}",
    "process.exit(1);",
  ].join("\n");
  writeFileSync(path.join(stubDir, "stub.cjs"), runner);
}

function writeHelp(file: string, body: string): void {
  writeFileSync(path.join(stubDir, file), body);
}

function installStub(name: string): string {
  const windows = process.platform === "win32";
  const file = path.join(stubDir, windows ? `${name}.cmd` : name);
  const body = windows
    ? `@echo off\r\nnode "%~dp0stub.cjs" %*\r\n`
    : `#!/bin/sh\nexec node "$(dirname "$0")/stub.cjs" "$@"\n`;
  writeFileSync(file, body);
  if (!windows) {
    chmodSync(file, 0o755);
  }
  return file;
}

function recordedArgv(): string[] {
  return readFileSync(path.join(stubDir, ARGS_FILE), "utf8").split("\n").filter(Boolean);
}

function runArgv(): string {
  return recordedArgv().filter((line) => !line.includes("--help"))[0] ?? "";
}

async function runAdapter(
  engine: EngineId,
  permissionMode: EnginePermissionMode,
  resumeSessionId?: string,
): Promise<StageLogDraft[]> {
  const logs: StageLogDraft[] = [];
  await ADAPTERS[engine].run({
    runId: `permission-${engine}`,
    prompt: "say hello",
    cwd: stubDir,
    permissionMode,
    connection: { mode: "subscription" },
    resumeSessionId,
    timeoutMs: 15_000,
    signal: new AbortController().signal,
    onLog: (log) => logs.push(log),
  });
  return logs;
}

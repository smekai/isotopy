// AAAAA forbids inline logic in a test body, so the stub binary that stands in for
// a real CLI — installed through the documented ISOTOPY_*_PATH override, and
// recording what it was called with — lives here.
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { EngineId, StageLogDraft } from "@isotopy/core";
import { claudeCodeAdapter } from "../../src/engines/claude-code.ts";
import { codexAdapter } from "../../src/engines/codex.ts";
import { cursorAdapter } from "../../src/engines/cursor.ts";
import type { EngineAdapter, EngineRunContext, EngineRunResult } from "../../src/engines/types.ts";

export const HELP_FILE = "help.txt";

const RESUME_HELP_FILE = "help-resume.txt";
const ARGS_FILE = "args.txt";
const STDOUT_FILE = "stdout.txt";
const BROWSERS_PATH_FILE = "browsers-path.txt";

const PATH_ENV: Record<EngineId, string> = {
  "claude-code": "ISOTOPY_CLAUDE_PATH",
  codex: "ISOTOPY_CODEX_PATH",
  cursor: "ISOTOPY_CURSOR_PATH",
};

const ADAPTERS: Record<EngineId, EngineAdapter> = {
  "claude-code": claudeCodeAdapter,
  codex: codexAdapter,
  cursor: cursorAdapter,
};

let stubDir = "";

export function installEngineStubs(): string {
  stubDir = mkdtempSync(path.join(os.tmpdir(), "isotopy-engine-stub-"));
  writeStubRunner();
  for (const [engine, variable] of Object.entries(PATH_ENV)) {
    process.env[variable] = installStub(stubName(engine as EngineId));
  }
  return stubDir;
}

export function resetEngineStubs(): void {
  writeFileSync(path.join(stubDir, ARGS_FILE), "");
  writeFileSync(path.join(stubDir, BROWSERS_PATH_FILE), "");
  writeStubHelp(HELP_FILE, "");
  writeStubHelp(RESUME_HELP_FILE, "");
  writeFileSync(path.join(stubDir, STDOUT_FILE), "");
}

export function removeEngineStubs(): void {
  for (const variable of Object.values(PATH_ENV)) {
    delete process.env[variable];
  }
  rmSync(stubDir, { recursive: true, force: true, maxRetries: 3 });
}

export function writeStubHelp(file: string, body: string): void {
  writeFileSync(path.join(stubDir, file), body);
}

export function writeStubStdout(lines: string[]): void {
  writeFileSync(path.join(stubDir, STDOUT_FILE), lines.join("\n"));
}

export function recordedArgv(): string[] {
  return recordedLines(ARGS_FILE);
}

export function runArgv(): string {
  return recordedArgv().filter((line) => !line.includes("--help"))[0] ?? "";
}

export function recordedBrowsersPaths(): string[] {
  return recordedLines(BROWSERS_PATH_FILE);
}

export async function runStubAdapter(
  engine: EngineId,
  overrides: Partial<EngineRunContext> = {},
): Promise<StageLogDraft[]> {
  const logs: StageLogDraft[] = [];
  await ADAPTERS[engine].run(stubContext(engine, logs, overrides));
  return logs;
}

export function runStubAdapterResult(
  engine: EngineId,
  overrides: Partial<EngineRunContext> = {},
): Promise<EngineRunResult> {
  return ADAPTERS[engine].run(stubContext(engine, [], overrides));
}

function stubContext(
  engine: EngineId,
  logs: StageLogDraft[],
  overrides: Partial<EngineRunContext>,
): EngineRunContext {
  return {
    runId: `stub-${engine}`,
    prompt: "say hello",
    cwd: stubDir,
    permissionMode: "skip",
    connection: { mode: "subscription" },
    toolCacheDir: path.join(stubDir, "cache"),
    timeoutMs: 15_000,
    signal: new AbortController().signal,
    onLog: (log) => logs.push(log),
    ...overrides,
  };
}

function recordedLines(file: string): string[] {
  return readFileSync(path.join(stubDir, file), "utf8").split("\n").filter(Boolean);
}

function stubName(engine: EngineId): string {
  return engine === "cursor" ? "cursor-agent" : engine === "codex" ? "codex" : "claude";
}

// The stub records the one variable under test rather than its whole environment,
// which carries the developer's real provider keys.
function writeStubRunner(): void {
  const runner = [
    'const fs = require("node:fs");',
    'const path = require("node:path");',
    "const args = process.argv.slice(2);",
    'fs.appendFileSync(path.join(__dirname, "args.txt"), args.join(" ") + "\\n");',
    'fs.appendFileSync(',
    '  path.join(__dirname, "browsers-path.txt"),',
    '  (process.env.PLAYWRIGHT_BROWSERS_PATH || "<unset>") + "\\n",',
    ");",
    'if (args.includes("--help")) {',
    '  const file = args.includes("resume") ? "help-resume.txt" : "help.txt";',
    '  process.stdout.write(fs.readFileSync(path.join(__dirname, file), "utf8"));',
    "  process.exit(0);",
    "}",
    'const out = fs.readFileSync(path.join(__dirname, "stdout.txt"), "utf8");',
    'if (out !== "") {',
    '  process.stdout.write(out + "\\n");',
    "  process.exit(0);",
    "}",
    "process.exit(1);",
  ].join("\n");
  writeFileSync(path.join(stubDir, "stub.cjs"), runner);
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

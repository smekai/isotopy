// Component test: every Isotopy prompt is multi-line (the persona and the stage
// context are separated by blank lines), and on Windows every CLI resolves to a
// `.cmd` shim, which cmd.exe cannot carry a multi-line argument through. An
// adapter that puts the prompt in argv therefore never runs at all on Windows —
// `runSubprocess` refuses it before spawning. Cursor did exactly that until it
// was made to send the prompt on stdin like the other two.
//
// The assertion is one sentence on both platforms: on Windows the guard would
// fire and must not; on macOS the binary is no shim, so it cannot fire either.
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { EngineId } from "@isotopy/core";
import { claudeCodeAdapter } from "../../src/engines/claude-code.ts";
import { codexAdapter } from "../../src/engines/codex.ts";
import { cursorAdapter } from "../../src/engines/cursor.ts";
import type { EngineAdapter, EngineRunResult } from "../../src/engines/types.ts";

const SHIM_REFUSAL = "Multi-line argument";

const MULTI_LINE_PROMPT = "You are the Orchestrator.\n\n---\n\nCompose a team.";

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

let stubDir: string;

beforeAll(() => {
  stubDir = mkdtempSync(path.join(os.tmpdir(), "isotopy-prompt-stub-"));
  process.env[PATH_ENV["claude-code"]] = writeSilentStub("claude");
  process.env[PATH_ENV.codex] = writeSilentStub("codex");
  process.env[PATH_ENV.cursor] = writeSilentStub("cursor-agent");
});

afterAll(() => {
  for (const variable of Object.values(PATH_ENV)) {
    delete process.env[variable];
  }
  rmSync(stubDir, { recursive: true, force: true, maxRetries: 3 });
});

describe("a multi-line prompt reaches every harness", () => {
  test("claude-code carries a multi-line prompt without tripping the shim guard", async () => {
    // Act
    const result = await runAdapter("claude-code");

    // Assert
    expect(result.errorMessage ?? "").not.toContain(SHIM_REFUSAL);
  });

  test("codex carries a multi-line prompt without tripping the shim guard", async () => {
    // Act
    const result = await runAdapter("codex");

    // Assert
    expect(result.errorMessage ?? "").not.toContain(SHIM_REFUSAL);
  });

  test("cursor carries a multi-line prompt without tripping the shim guard", async () => {
    // Act
    const result = await runAdapter("cursor");

    // Assert
    expect(result.errorMessage ?? "").not.toContain(SHIM_REFUSAL);
  });
});

function writeSilentStub(name: string): string {
  const windows = process.platform === "win32";
  const file = path.join(stubDir, windows ? `${name}.cmd` : name);
  writeFileSync(file, windows ? "@echo off\r\nexit /b 0\r\n" : "#!/bin/sh\nexit 0\n");
  if (!windows) {
    chmodSync(file, 0o755);
  }
  return file;
}

function runAdapter(engine: EngineId): Promise<EngineRunResult> {
  return ADAPTERS[engine].run({
    runId: `prompt-${engine}`,
    prompt: MULTI_LINE_PROMPT,
    appendSystemPrompt: "You are a helpful assistant.\n\nBe brief.",
    cwd: stubDir,
    permissionMode: "skip",
    connection: { mode: "subscription" },
    toolCacheDir: path.join(stubDir, "cache"),
    timeoutMs: 15_000,
    signal: new AbortController().signal,
    onLog: () => {},
  });
}

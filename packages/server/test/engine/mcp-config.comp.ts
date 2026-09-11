// Component test: how does each real adapter hand its CLI a tool? Isotopy is not
// an MCP client — the engine CLI is — so what has to be proved is the rendering:
// the flags, the written config, and what happens on a CLI that carries a tool
// only by reading a file beside the code.
//
// Each adapter runs against the stub binary installed through the documented
// ISOTOPY_*_PATH override and records the argv it was called with.
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "vitest";
import type { EngineId, StageLogDraft } from "@isotopy/core";
import {
  installEngineStubs,
  recordedArgv,
  removeEngineStubs,
  resetEngineStubs,
  runArgv,
  runStubAdapter,
} from "../support/engine-stub.ts";
import type { EngineRunContext, McpToolRequest } from "../../src/engines/types.ts";
import type { ToolId } from "../../src/domain/rules/tool-catalog.ts";
import { openMcpSetup } from "../../src/engines/mcp-config.ts";

const SESSION = "d0280d10-d76c-4703-a0ce-0ab42acdc2be";

const USER_CURSOR_CONFIG = '{\n  "mcpServers": {\n    "mine": { "command": "node" }\n  }\n}\n';

let scratch: string;

beforeAll(() => {
  installEngineStubs();
});

afterAll(() => {
  removeEngineStubs();
});

beforeEach(() => {
  resetEngineStubs();
  scratch = mkdtempSync(path.join(os.tmpdir(), "isotopy-mcp-"));
});

afterEach(() => {
  rmSync(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

test("a step declaring a tool hands Claude Code the config and shuts out every other one", async () => {
  // Arrange — nothing beyond the stub.
  // Act
  await runWithTaskplanner("claude-code");

  // Assert — without --strict-mcp-config the CLI would also load whatever the
  // user's own project configured, so the declaration would not be the whole list.
  expect(runArgv()).toContain(`--mcp-config ${configPath()}`);
  expect(runArgv()).toContain("--strict-mcp-config");
});

test("the written config launches Node on a JavaScript file, not the CLI shim", async () => {
  // Arrange — nothing.
  // Act
  await runWithTaskplanner("claude-code");

  // Assert — the bare `taskplanner-mcp` bin resolves to a .cmd on Windows, which
  // would force `shell: true`; naming the module path avoids the shim entirely.
  const written = writtenConfig();
  expect(written.mcpServers.taskplanner?.command).toBe("node");
  expect(written.mcpServers.taskplanner?.args?.[0]).toMatch(/mcp-server\.js$/);
  expect(written.mcpServers.taskplanner?.args?.[0]).toBe(
    path.resolve(written.mcpServers.taskplanner?.args?.[0] ?? ""),
  );
});

test("the tool is pinned to the board the run works on, whatever directory the CLI starts in", async () => {
  // Arrange — nothing.
  // Act
  await runWithTaskplanner("claude-code");

  // Assert
  expect(writtenConfig().mcpServers.taskplanner?.env).toEqual({
    TASKPLANNER_WORKSPACE_ROOT: scratch,
  });
});

test("the tools a step gets are read-only, because nothing in the product clears the owner's mark", async () => {
  // Arrange — nothing.
  // Act
  await runWithTaskplanner("claude-code");

  // Assert
  expect(runArgv()).toContain("--disallowedTools");
  expect(runArgv()).toContain("mcp__taskplanner__taskplanner_update");
});

test("Codex carries the same server through its config flags", async () => {
  // Arrange — nothing.
  // Act
  await runWithTaskplanner("codex");

  // Assert
  expect(runArgv()).toContain("-c mcp_servers.taskplanner.command='node'");
  expect(runArgv()).toContain("mcp_servers.taskplanner.env={ TASKPLANNER_WORKSPACE_ROOT =");
});

test("a resumed Codex turn keeps its tools, which `exec resume` would otherwise start without", async () => {
  // Arrange — nothing.
  // Act
  await runWithTaskplanner("codex", { resumeSessionId: SESSION });

  // Assert
  expect(runArgv()).toContain("exec resume");
  expect(runArgv()).toContain("-c mcp_servers.taskplanner.command='node'");
});

test("Codex says it cannot deny a single tool, rather than implying the mark is protected", async () => {
  // Arrange — nothing.
  // Act
  const logs = await runWithTaskplanner("codex");

  // Assert
  expect(noticesIn(logs)).toContain("cannot deny individual tools");
});

test("Cursor takes no flag, so the config is written where its CLI actually reads one", async () => {
  // Arrange — nothing.
  // Act
  await runWithTaskplanner("cursor");

  // Assert
  expect(runArgv()).toContain("--approve-mcps");
});

test("a Cursor config the project already had comes back byte-identical", async () => {
  // Arrange
  mkdirSync(path.join(scratch, ".cursor"), { recursive: true });
  writeFileSync(cursorConfigPath(), USER_CURSOR_CONFIG, "utf8");

  // Act
  await runWithTaskplanner("cursor");

  // Assert
  expect(readFileSync(cursorConfigPath(), "utf8")).toBe(USER_CURSOR_CONFIG);
});

test("a Cursor config Isotopy created is taken away again, leaving the repository as it was", async () => {
  // Arrange — the project has no .cursor/mcp.json.
  // Act
  await runWithTaskplanner("cursor");

  // Assert
  expect(existsSync(cursorConfigPath())).toBe(false);
});

// A server killed mid-run leaves the project config replaced. The run that finds it
// always carries a different id, because a restart marks the interrupted run failed.
test("a Cursor config left behind by a killed run is recovered by the next run", async () => {
  // Arrange — run A replaces the project config and never releases it.
  mkdirSync(path.join(scratch, ".cursor"), { recursive: true });
  writeFileSync(cursorConfigPath(), USER_CURSOR_CONFIG, "utf8");
  await openMcpSetup("cursor", killedRunContext());

  // Act — run B, a different id, runs and releases normally.
  await runWithTaskplanner("cursor", { runId: "run-b" });

  // Assert
  expect(readFileSync(cursorConfigPath(), "utf8")).toBe(USER_CURSOR_CONFIG);
});

test("a killed run's own generated config is never mistaken for the user's", async () => {
  // Arrange — no config of the project's own, and run A leaves Isotopy's behind.
  await openMcpSetup("cursor", killedRunContext());

  // Act
  await runWithTaskplanner("cursor", { runId: "run-b" });

  // Assert
  expect(existsSync(cursorConfigPath())).toBe(false);
});

test("a step declaring no tool passes no MCP flag and writes no config", async () => {
  // Arrange — nothing.
  // Act
  await runStubAdapter("claude-code", { cwd: scratch, mcpTools: request([]) });

  // Assert — a project that configured MCP deliberately keeps what it configured.
  expect(runArgv()).not.toContain("--mcp-config");
  expect(existsSync(configPath())).toBe(false);
});

test("a step declaring no tool leaves a Cursor config the project already had untouched", async () => {
  // Arrange
  mkdirSync(path.join(scratch, ".cursor"), { recursive: true });
  writeFileSync(cursorConfigPath(), USER_CURSOR_CONFIG, "utf8");

  // Act
  await runStubAdapter("cursor", { cwd: scratch, mcpTools: request([]) });

  // Assert
  expect(readFileSync(cursorConfigPath(), "utf8")).toBe(USER_CURSOR_CONFIG);
  expect(recordedArgv()).toHaveLength(1);
});

interface WrittenConfig {
  mcpServers: Record<string, { command?: string; args?: string[]; env?: Record<string, string> }>;
}

function request(tools: ToolId[], runId = "run"): McpToolRequest {
  return {
    tools,
    runDir: path.join(scratch, runId),
    projectDir: scratch,
    workspaceRoot: scratch,
  };
}

function runWithTaskplanner(
  engine: EngineId,
  overrides: { resumeSessionId?: string; runId?: string } = {},
): Promise<StageLogDraft[]> {
  const { runId, ...rest } = overrides;
  return runStubAdapter(engine, {
    cwd: scratch,
    mcpTools: request(["taskplanner"], runId),
    ...rest,
  });
}

function killedRunContext(): EngineRunContext {
  return {
    runId: "run-a",
    prompt: "say hello",
    cwd: scratch,
    permissionMode: "skip",
    connection: { mode: "subscription" },
    toolCacheDir: path.join(scratch, "cache"),
    mcpTools: request(["taskplanner"], "run-a"),
    timeoutMs: 15_000,
    signal: new AbortController().signal,
    onLog: () => {},
  };
}

function configPath(): string {
  return path.join(scratch, "run", "mcp.json");
}

function cursorConfigPath(): string {
  return path.join(scratch, ".cursor", "mcp.json");
}

function writtenConfig(): WrittenConfig {
  return JSON.parse(readFileSync(configPath(), "utf8")) as WrittenConfig;
}

function noticesIn(logs: StageLogDraft[]): string {
  return logs
    .filter((log) => log.level === "info")
    .map((log) => log.message)
    .join("; ");
}

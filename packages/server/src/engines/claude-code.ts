import { execFile, execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { EngineStatus } from "@adhd/core";
import { firstLine, truncate } from "./log-text.js";
import { runSubprocess } from "./subprocess.js";
import type {
  EngineAdapter,
  EngineConnection,
  EngineRunContext,
  EngineRunResult,
} from "./types.js";

const INSTALL_HINT =
  "Claude Code CLI not found. Install it (npm i -g @anthropic-ai/claude-code) " +
  "or set ADHD_CLAUDE_PATH to the claude executable.";

interface ResolvedBinary {
  path: string;
  source: "env" | "path" | "ide-extension";
}

let cachedBinary: ResolvedBinary | undefined;

/** Last resort: the native binary bundled with the Claude Code IDE extension. */
function findIdeExtensionBinary(): string | undefined {
  const binaryName = process.platform === "win32" ? "claude.exe" : "claude";
  for (const ide of [".vscode", ".cursor"]) {
    const extensionsDir = path.join(os.homedir(), ide, "extensions");
    let entries: string[];
    try {
      entries = readdirSync(extensionsDir);
    } catch {
      continue;
    }
    const candidates = entries
      .filter((name) => name.startsWith("anthropic.claude-code-"))
      .sort()
      .reverse();
    for (const name of candidates) {
      const bin = path.join(extensionsDir, name, "resources", "native-binary", binaryName);
      if (existsSync(bin)) {
        return bin;
      }
    }
  }
  return undefined;
}

function resolveClaudeBinary(): ResolvedBinary {
  if (cachedBinary) {
    return cachedBinary;
  }
  const fromEnv = process.env.ADHD_CLAUDE_PATH;
  if (fromEnv && fromEnv.trim() !== "") {
    const envPath = fromEnv.trim();
    if (!existsSync(envPath)) {
      throw new Error(`ADHD_CLAUDE_PATH points to a missing file: ${envPath}`);
    }
    cachedBinary = { path: envPath, source: "env" };
    return cachedBinary;
  }
  try {
    const lookup = process.platform === "win32" ? "where" : "which";
    const output = execFileSync(lookup, ["claude"], { encoding: "utf8" });
    const first = firstLine(output);
    if (first) {
      cachedBinary = { path: first, source: "path" };
      return cachedBinary;
    }
  } catch {
    // not on PATH — try the IDE extension bundle below
  }
  const fromIde = findIdeExtensionBinary();
  if (fromIde) {
    cachedBinary = { path: fromIde, source: "ide-extension" };
    return cachedBinary;
  }
  throw new Error(INSTALL_HINT);
}

function claudeVersion(binary: string): Promise<string> {
  return new Promise((resolve, reject) => {
    // Same Node >= 20 rule as the run spawn: .cmd/.bat shims need a shell.
    const useShell = /\.(cmd|bat)$/i.test(binary);
    execFile(
      useShell ? `"${binary}"` : binary,
      ["--version"],
      { encoding: "utf8", timeout: 10_000, shell: useShell },
      (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(firstLine(stdout) ?? "");
      },
    );
  });
}

/** Known CLI failure signatures mapped to actionable guidance. */
const ERROR_HINTS: Array<{ pattern: RegExp; message: string }> = [
  {
    pattern: /usage credits required|switch to standard context/i,
    message:
      "Your plan doesn't include 1M context. Switch the model to Sonnet (standard) in Setup → AI Harness, or enable usage credits / use an API key.",
  },
  {
    pattern: /invalid api key|authentication_error/i,
    message: "Invalid Anthropic API key — update it in Setup → Connection.",
  },
  {
    pattern: /please run \/login|not logged in/i,
    message:
      "Claude CLI isn't logged in. Run `claude /login` in a terminal, or configure an API key in Setup → Connection.",
  },
  {
    pattern: /credit balance is too low/i,
    message:
      "API credit balance too low — top up or switch to subscription mode in Setup → Connection.",
  },
  {
    pattern: /session limit/i,
    message:
      "Claude subscription session limit reached — wait for the reset time shown in the log, or switch to an API key in Setup → Connection.",
  },
];

function mapKnownError(raw: string): string | undefined {
  return ERROR_HINTS.find((hint) => hint.pattern.test(raw))?.message;
}

/**
 * Environment for the spawned CLI. Anthropic credentials are stripped so a
 * stray key in the server env can't silently switch billing away from the
 * user's CLI login (subscription mode); api-key mode injects the stored key.
 */
function buildChildEnv(connection?: EngineConnection): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  delete env.ANTHROPIC_AUTH_TOKEN; // setting both makes the CLI reject requests
  if (connection?.mode === "api-key" && connection.apiKey) {
    env.ANTHROPIC_API_KEY = connection.apiKey;
  }
  return env;
}

function toolUseSummary(name: string, input: Record<string, unknown>): string {
  const detail = input.file_path ?? input.command ?? input.pattern ?? input.path ?? "";
  return truncate(`▶ ${name} ${String(detail)}`);
}

interface ClaudeStreamEvent {
  type?: string;
  subtype?: string;
  model?: string;
  tools?: unknown[];
  result?: string;
  is_error?: boolean;
  total_cost_usd?: number;
  duration_ms?: number;
  num_turns?: number;
  message?: {
    content?: Array<{
      type?: string;
      text?: string;
      name?: string;
      input?: Record<string, unknown>;
      is_error?: boolean;
      content?: unknown;
    }>;
  };
}

/**
 * Render one Claude stream-json event to the run log. Returns the event when
 * it's the final `result` event so the caller can capture cost/turns/result.
 */
function handleClaudeEvent(
  event: ClaudeStreamEvent,
  onLog: EngineRunContext["onLog"],
): ClaudeStreamEvent | undefined {
  if (event.type === "system" && event.subtype === "init") {
    const tools = Array.isArray(event.tools) ? `${event.tools.length} tools` : "";
    onLog("info", truncate(`Claude Code online · ${event.model ?? "default model"} · ${tools}`));
    return undefined;
  }
  if (event.type === "assistant") {
    for (const item of event.message?.content ?? []) {
      if (item.type === "text" && item.text) {
        onLog("info", truncate(item.text));
      } else if (item.type === "tool_use" && item.name) {
        onLog("run", toolUseSummary(item.name, item.input ?? {}));
      }
    }
    return undefined;
  }
  if (event.type === "user") {
    for (const item of event.message?.content ?? []) {
      if (item.type === "tool_result" && item.is_error) {
        onLog("warn", truncate(`Tool error: ${JSON.stringify(item.content)}`));
      }
    }
    return undefined;
  }
  if (event.type === "result") {
    const cost = event.total_cost_usd !== undefined ? `$${event.total_cost_usd.toFixed(4)}` : "?";
    const turns = event.num_turns ?? "?";
    const secs = event.duration_ms !== undefined ? `${Math.round(event.duration_ms / 1000)}s` : "?";
    onLog("info", `cost ${cost} · ${turns} turns · ${secs}`);
    return event;
  }
  return undefined;
}

export const claudeCodeAdapter: EngineAdapter = {
  id: "claude-code",

  async detect(): Promise<EngineStatus> {
    cachedBinary = undefined; // re-check must pick up a newly installed CLI
    let resolved: ResolvedBinary;
    try {
      resolved = resolveClaudeBinary();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { engine: "claude-code", installed: false, message };
    }
    try {
      const version = await claudeVersion(resolved.path);
      return {
        engine: "claude-code",
        installed: true,
        path: resolved.path,
        version,
        source: resolved.source,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        engine: "claude-code",
        installed: false,
        path: resolved.path,
        source: resolved.source,
        message: `Found ${resolved.path} but "claude --version" failed: ${message}`,
      };
    }
  },

  async run(ctx: EngineRunContext): Promise<EngineRunResult> {
    let binary: string;
    try {
      binary = resolveClaudeBinary().path;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.onLog("fail", message);
      return { success: false, exitCode: null, errorMessage: message };
    }

    const args = [
      "-p",
      "--output-format",
      "stream-json",
      "--verbose",
      // Bare mode reads auth strictly from ANTHROPIC_API_KEY — without it a
      // logged-in CLI silently ignores the injected key and bills the plan.
      ...(ctx.connection?.mode === "api-key" ? ["--bare"] : []),
      ...(ctx.model ? ["--model", ctx.model] : []),
      ...(ctx.permissionMode === "acceptEdits"
        ? ["--permission-mode", "acceptEdits"]
        : ["--dangerously-skip-permissions"]),
    ];

    // The generic harness owns the process lifecycle (spawn, timeout, abort,
    // process-tree kill); we parse Claude's stream-json output off each line.
    let finalEvent: ClaudeStreamEvent | undefined;
    const result = await runSubprocess({
      command: binary,
      args,
      cwd: ctx.cwd,
      env: buildChildEnv(ctx.connection),
      input: ctx.prompt,
      timeoutMs: ctx.timeoutMs,
      signal: ctx.signal,
      onLine: (stream, line) => {
        if (stream !== "stdout") {
          return;
        }
        const trimmed = line.trim();
        if (!trimmed) {
          return;
        }
        try {
          const captured = handleClaudeEvent(JSON.parse(trimmed) as ClaudeStreamEvent, ctx.onLog);
          if (captured) {
            finalEvent = captured;
          }
        } catch {
          // non-JSON output line — ignore
        }
      },
    });

    const success = result.success && finalEvent?.subtype === "success" && !finalEvent.is_error;
    let errorMessage: string | undefined;
    if (!success) {
      if (result.timedOut) {
        errorMessage = `Timed out after ${Math.round(ctx.timeoutMs / 1000)}s`;
      } else if (result.aborted) {
        errorMessage = "Aborted";
      } else if (result.exitCode === null && !finalEvent) {
        // The CLI never started (bad binary, etc.) — surface the spawn reason.
        errorMessage = result.errorMessage ?? "Failed to start Claude Code";
        ctx.onLog("fail", errorMessage);
      } else {
        const stderr = result.stderrTail.join(" ").trim();
        // An error result can arrive as a non-success subtype or as is_error on
        // a "success" result event — take the text either way.
        const raw =
          finalEvent && (finalEvent.subtype !== "success" || finalEvent.is_error)
            ? (finalEvent.result ?? `Claude Code ended with ${finalEvent.subtype}`)
            : `Claude Code exited with code ${result.exitCode}${stderr ? ` — ${stderr}` : ""}`;
        const mapped = mapKnownError(stderr ? `${raw}\n${stderr}` : raw);
        if (mapped) {
          // Keep the raw error visible in the log; surface the guidance.
          ctx.onLog("warn", truncate(raw));
          errorMessage = mapped;
        } else {
          errorMessage = truncate(raw);
        }
      }
    }

    return {
      success,
      result: finalEvent?.result,
      exitCode: result.exitCode,
      errorMessage,
      costUsd: finalEvent?.total_cost_usd,
      durationMs: finalEvent?.duration_ms,
      numTurns: finalEvent?.num_turns,
    };
  },
};

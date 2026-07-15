import { execFile, execFileSync, spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { EngineStatus } from "@adhd/core";
import type {
  EngineAdapter,
  EngineConnection,
  EngineRunContext,
  EngineRunResult,
} from "./types.js";

const MAX_LOG_MESSAGE_LENGTH = 300;

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
    const first = output.split(/\r?\n/).find((line) => line.trim() !== "");
    if (first) {
      cachedBinary = { path: first.trim(), source: "path" };
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
        resolve(stdout.split(/\r?\n/).find((line) => line.trim() !== "")?.trim() ?? "");
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

function truncate(text: string, max = MAX_LOG_MESSAGE_LENGTH): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

function toolUseSummary(name: string, input: Record<string, unknown>): string {
  const detail = input.file_path ?? input.command ?? input.pattern ?? input.path ?? "";
  return truncate(`▶ ${name} ${String(detail)}`);
}

function killProcessTree(child: ChildProcess): void {
  if (child.exitCode !== null || child.signalCode !== null || child.pid === undefined) {
    return;
  }
  if (process.platform === "win32") {
    // child.kill() would leave grandchildren alive under the .cmd shim.
    spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"]);
  } else {
    child.kill("SIGTERM");
    const escalate = setTimeout(() => child.kill("SIGKILL"), 5000);
    escalate.unref();
  }
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

  run(ctx: EngineRunContext): Promise<EngineRunResult> {
    let binary: string;
    try {
      binary = resolveClaudeBinary().path;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.onLog("fail", message);
      return Promise.resolve({ success: false, exitCode: null, errorMessage: message });
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

    return new Promise<EngineRunResult>((resolve) => {
      // Node >= 20 refuses to spawn .cmd/.bat shims without a shell.
      const useShell = /\.(cmd|bat)$/i.test(binary);
      const child = spawn(useShell ? `"${binary}"` : binary, args, {
        cwd: ctx.cwd,
        shell: useShell,
        env: buildChildEnv(ctx.connection),
        stdio: ["pipe", "pipe", "pipe"],
      });

      let settled = false;
      let stdoutBuffer = "";
      let stderrTail: string[] = [];
      let timedOut = false;
      let finalEvent: ClaudeStreamEvent | undefined;

      const finish = (result: EngineRunResult) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        ctx.signal.removeEventListener("abort", onAbort);
        resolve(result);
      };

      const onAbort = () => killProcessTree(child);
      ctx.signal.addEventListener("abort", onAbort, { once: true });

      const timeout = setTimeout(() => {
        timedOut = true;
        killProcessTree(child);
      }, ctx.timeoutMs);
      timeout.unref();

      const handleEvent = (event: ClaudeStreamEvent) => {
        if (event.type === "system" && event.subtype === "init") {
          const tools = Array.isArray(event.tools) ? `${event.tools.length} tools` : "";
          ctx.onLog(
            "info",
            truncate(`Claude Code online · ${event.model ?? "default model"} · ${tools}`),
          );
          return;
        }
        if (event.type === "assistant") {
          for (const item of event.message?.content ?? []) {
            if (item.type === "text" && item.text) {
              ctx.onLog("info", truncate(item.text));
            } else if (item.type === "tool_use" && item.name) {
              ctx.onLog("run", toolUseSummary(item.name, item.input ?? {}));
            }
          }
          return;
        }
        if (event.type === "user") {
          for (const item of event.message?.content ?? []) {
            if (item.type === "tool_result" && item.is_error) {
              ctx.onLog("warn", truncate(`Tool error: ${JSON.stringify(item.content)}`));
            }
          }
          return;
        }
        if (event.type === "result") {
          finalEvent = event;
          const cost = event.total_cost_usd !== undefined ? `$${event.total_cost_usd.toFixed(4)}` : "?";
          const turns = event.num_turns ?? "?";
          const secs = event.duration_ms !== undefined ? `${Math.round(event.duration_ms / 1000)}s` : "?";
          ctx.onLog("info", `cost ${cost} · ${turns} turns · ${secs}`);
        }
      };

      const consumeLines = (chunk: string, flush = false) => {
        stdoutBuffer += chunk;
        const lines = stdoutBuffer.split("\n");
        stdoutBuffer = flush ? "" : (lines.pop() ?? "");
        for (const line of [...lines, ...(flush && stdoutBuffer ? [stdoutBuffer] : [])]) {
          const trimmed = line.trim();
          if (!trimmed) {
            continue;
          }
          try {
            handleEvent(JSON.parse(trimmed) as ClaudeStreamEvent);
          } catch {
            // non-JSON output line — ignore
          }
        }
      };

      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => consumeLines(chunk));
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk: string) => {
        stderrTail = [...stderrTail, ...chunk.split(/\r?\n/)].filter(Boolean).slice(-10);
      });

      child.on("error", (error) => {
        const message = `Failed to start Claude Code: ${error.message}`;
        ctx.onLog("fail", message);
        finish({ success: false, exitCode: null, errorMessage: message });
      });

      child.on("close", (exitCode) => {
        consumeLines("", true);
        const success =
          exitCode === 0 && finalEvent?.subtype === "success" && !finalEvent.is_error;
        let errorMessage: string | undefined;
        if (!success) {
          if (timedOut) {
            errorMessage = `Timed out after ${Math.round(ctx.timeoutMs / 1000)}s`;
          } else if (ctx.signal.aborted) {
            errorMessage = "Aborted";
          } else {
            const stderr = stderrTail.join(" ").trim();
            // An error result can arrive as a non-success subtype or as
            // is_error on a "success" result event — take the text either way.
            const raw =
              finalEvent && (finalEvent.subtype !== "success" || finalEvent.is_error)
                ? (finalEvent.result ?? `Claude Code ended with ${finalEvent.subtype}`)
                : `Claude Code exited with code ${exitCode}${stderr ? ` — ${stderr}` : ""}`;
            const mapped = mapKnownError(stderr ? `${raw}\n${stderr}` : raw);
            if (mapped) {
              // Keep the raw error visible in the log; surface the guidance.
              ctx.onLog("warn", truncate(raw, 500));
              errorMessage = mapped;
            } else {
              errorMessage = truncate(raw, 500);
            }
          }
        }
        finish({
          success,
          result: finalEvent?.result,
          exitCode,
          errorMessage,
          costUsd: finalEvent?.total_cost_usd,
          durationMs: finalEvent?.duration_ms,
          numTurns: finalEvent?.num_turns,
        });
      });

      child.stdin.on("error", () => {
        // stdin may close early if the process dies immediately; 'close' handles it.
      });
      child.stdin.write(ctx.prompt);
      child.stdin.end();
    });
  },
};

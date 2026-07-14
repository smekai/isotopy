import { execFileSync, spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { EngineAdapter, EngineRunContext, EngineRunResult } from "./types.js";

const MAX_LOG_MESSAGE_LENGTH = 300;

let cachedBinary: string | undefined;

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

function resolveClaudeBinary(): string {
  if (cachedBinary) {
    return cachedBinary;
  }
  const fromEnv = process.env.ADHD_CLAUDE_PATH;
  if (fromEnv && fromEnv.trim() !== "") {
    cachedBinary = fromEnv.trim();
    return cachedBinary;
  }
  try {
    const lookup = process.platform === "win32" ? "where" : "which";
    const output = execFileSync(lookup, ["claude"], { encoding: "utf8" });
    const first = output.split(/\r?\n/).find((line) => line.trim() !== "");
    if (first) {
      cachedBinary = first.trim();
      return cachedBinary;
    }
  } catch {
    // not on PATH — try the IDE extension bundle below
  }
  const fromIde = findIdeExtensionBinary();
  if (fromIde) {
    cachedBinary = fromIde;
    return cachedBinary;
  }
  throw new Error(
    "Claude Code CLI not found. Install it (npm i -g @anthropic-ai/claude-code) " +
      "or set ADHD_CLAUDE_PATH to the claude executable.",
  );
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

  run(ctx: EngineRunContext): Promise<EngineRunResult> {
    let binary: string;
    try {
      binary = resolveClaudeBinary();
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
        env: process.env,
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
          } else if (finalEvent && finalEvent.subtype !== "success") {
            errorMessage = truncate(finalEvent.result ?? `Claude Code ended with ${finalEvent.subtype}`);
          } else {
            const stderr = stderrTail.join(" ").trim();
            errorMessage = truncate(
              `Claude Code exited with code ${exitCode}${stderr ? ` — ${stderr}` : ""}`,
              500,
            );
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

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { EngineLimit, EngineStatus, ModelOptionDraft } from "@isotopy/core";
import { detectEngineLimit } from "../domain/rules/engine-limit.ts";
import type { PermissionStrategy } from "../domain/rules/permission-plan.ts";
import { claudeSettingsModel } from "../schemas/engine-cli-config.ts";
import { claudePermissionModeChoices } from "../schemas/engine-cli-help.ts";
import { NO_LIVE_LISTING, configuredModelFrom } from "./cli-config.ts";
import { parseClaudeProtocolLine } from "./claude-protocol.ts";
import { firstLine, truncate, withStderr } from "./log-text.ts";
import { toolCacheEnv } from "./tool-cache.ts";
import { withPersonaPrompt } from "./persona.ts";
import {
  clearAutoReviewCache,
  probeAutoReview,
  resolvePermissionPlan,
} from "./permission-mode.ts";
import type { AutoReviewProbe } from "./permission-mode.ts";
import {
  applyProtocolUpdate,
  protocolProblemMessage,
} from "./protocol-validation.ts";
import type { EngineProtocolUpdate } from "./protocol-validation.ts";
import { commandNeedsWindowsShell, probeCommand, runSubprocess } from "./subprocess.ts";
import type {
  EngineAdapter,
  LiveModelLayer,
  EngineConnection,
  EngineRunContext,
  EngineRunResult,
} from "./types.ts";

const INSTALL_HINT =
  "Claude Code CLI not found. Install it (npm i -g @anthropic-ai/claude-code) " +
  "or set ISOTOPY_CLAUDE_PATH to the claude executable.";

interface ResolvedBinary {
  path: string;
  source: "env" | "path" | "ide-extension";
}

let cachedBinary: ResolvedBinary | undefined;

const AUTO_REVIEW_PROBE: AutoReviewProbe = {
  helpArgs: ["--help"],
  advertised: (help) => claudePermissionModeChoices(help).includes("auto"),
};

function permissionArgs(strategy: PermissionStrategy): string[] {
  switch (strategy) {
    case "unrestricted":
      return ["--dangerously-skip-permissions"];
    case "autoReview":
      return ["--permission-mode", "auto"];
    case "acceptEdits":
      return ["--permission-mode", "acceptEdits"];
    default: {
      const unreachable: never = strategy;
      return unreachable;
    }
  }
}

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
  const fromEnv = process.env.ISOTOPY_CLAUDE_PATH;
  if (fromEnv && fromEnv.trim() !== "") {
    const envPath = fromEnv.trim();
    if (!existsSync(envPath)) {
      throw new Error(`ISOTOPY_CLAUDE_PATH points to a missing file: ${envPath}`);
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
  } catch {}
  const fromIde = findIdeExtensionBinary();
  if (fromIde) {
    cachedBinary = { path: fromIde, source: "ide-extension" };
    return cachedBinary;
  }
  throw new Error(INSTALL_HINT);
}

async function claudeVersion(binary: string): Promise<string> {
  const result = await probeCommand(binary, ["--version"]);
  if (!result.success) {
    throw new Error(result.errorMessage ?? "claude --version failed");
  }
  return firstLine(result.stdout) ?? "";
}

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
];

function mapKnownError(raw: string): string | undefined {
  return ERROR_HINTS.find((hint) => hint.pattern.test(raw))?.message;
}

function buildChildEnv(
  connection: EngineConnection | undefined,
  toolCacheDir: string,
): NodeJS.ProcessEnv {
  const env = { ...process.env, ...toolCacheEnv(toolCacheDir) };
  delete env.ANTHROPIC_API_KEY;
  delete env.ANTHROPIC_AUTH_TOKEN;
  if (connection?.mode === "api-key" && connection.apiKey) {
    env.ANTHROPIC_API_KEY = connection.apiKey;
  }
  return env;
}

export const claudeCodeAdapter: EngineAdapter = {
  id: "claude-code",

  liveModels(): Promise<LiveModelLayer> {
    return Promise.resolve(NO_LIVE_LISTING);
  },

  configuredModel(): ModelOptionDraft | undefined {
    return configuredModelFrom(
      path.join(os.homedir(), ".claude", "settings.json"),
      claudeSettingsModel,
      "from your ~/.claude/settings.json",
    );
  },

  async detect(): Promise<EngineStatus> {
    cachedBinary = undefined;
    clearAutoReviewCache();
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
      ctx.onLog({ level: "fail", message });
      return { success: false, exitCode: null, errorMessage: message };
    }

    const plan = await resolvePermissionPlan("claude-code", ctx, () =>
      probeAutoReview(binary, AUTO_REVIEW_PROBE),
    );

    const personaViaFlag =
      ctx.appendSystemPrompt !== undefined && !commandNeedsWindowsShell(binary);
    const runCtx = personaViaFlag ? ctx : withPersonaPrompt(ctx);

    const args = [
      "-p",
      "--output-format",
      "stream-json",
      "--verbose",
      ...(ctx.connection?.mode === "api-key" ? ["--bare"] : []),
      ...(ctx.resumeSessionId ? ["--resume", ctx.resumeSessionId] : []),
      ...(ctx.model ? ["--model", ctx.model] : []),
      ...(ctx.effort ? ["--effort", ctx.effort] : []),
      ...(personaViaFlag && ctx.appendSystemPrompt
        ? ["--append-system-prompt", ctx.appendSystemPrompt]
        : []),
      ...permissionArgs(plan.strategy),
    ];

    const capture: EngineProtocolUpdate = {
      sessionId: ctx.resumeSessionId,
      logs: [],
    };
    const result = await runSubprocess({
      command: binary,
      args,
      cwd: ctx.cwd,
      env: buildChildEnv(ctx.connection, ctx.toolCacheDir),
      input: runCtx.prompt,
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
        const parsed = parseClaudeProtocolLine(trimmed);
        if (!parsed.ok) {
          ctx.onLog({ level: "warn", message: protocolProblemMessage(parsed.problem) });
          return;
        }
        applyProtocolUpdate(capture, parsed.event, ctx.onLog);
      },
    });

    const success = result.success && capture.terminal === "success";
    let errorMessage: string | undefined;
    let limit: EngineLimit | undefined;
    if (!success) {
      if (result.timedOut) {
        errorMessage = `Timed out after ${Math.round(ctx.timeoutMs / 1000)}s`;
      } else if (result.aborted) {
        errorMessage = "Aborted";
      } else if (result.exitCode === null && capture.terminal === undefined) {
        errorMessage = result.errorMessage ?? "Failed to start Claude Code";
        ctx.onLog({ level: "fail", message: errorMessage });
      } else {
        const stderr = result.stderrTail.join(" ").trim();
        const raw =
          capture.terminal === "failure"
            ? (capture.error ??
              `Claude Code ended with ${capture.terminalLabel ?? "an error"}`)
            : `Claude Code exited with code ${result.exitCode}${stderr ? ` — ${stderr}` : ""}`;
        const detail = withStderr(raw, stderr);
        limit = detectEngineLimit("claude-code", truncate(detail));
        const mapped = mapKnownError(detail);
        if (mapped ?? limit) {
          ctx.onLog({ level: "warn", message: truncate(raw) });
        }
        errorMessage = mapped ?? truncate(raw);
      }
    }

    return {
      success,
      result: capture.output,
      sessionId: capture.sessionId,
      exitCode: result.exitCode,
      errorMessage,
      limit,
      usage: capture.usage,
    };
  },
};

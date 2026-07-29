import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { CODEX_MODEL_OPTIONS } from "@adhd/core";
import type { EngineModelList, EngineStatus } from "@adhd/core";
import { parseCodexProtocolLine } from "./codex-protocol.ts";
import { firstLine, truncate } from "./log-text.ts";
import { withPersonaPrompt } from "./persona.ts";
import { probeCommand, runSubprocess } from "./subprocess.ts";
import {
  applyProtocolUpdate,
  protocolProblemMessage,
} from "./protocol-validation.ts";
import type { EngineProtocolUpdate } from "./protocol-validation.ts";
import type {
  EngineActionResult,
  EngineAdapter,
  EngineConnection,
  EngineRunContext,
  EngineRunResult,
} from "./types.ts";

const INSTALL_COMMAND = "npm install -g @openai/codex";
const DOCS_URL = "https://developers.openai.com/codex/cli";

const INSTALL_HINT =
  `Codex CLI not found. Install it (${INSTALL_COMMAND}), then run \`codex login\` once. ` +
  "Or set ADHD_CODEX_PATH to the codex executable.";

interface ResolvedBinary {
  path: string;
  source: "env" | "path";
}

let cachedBinary: ResolvedBinary | undefined;

function pickBinaryLine(output: string): string | undefined {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (process.platform === "win32") {
    const shim = lines.find((line) => /\.(cmd|exe|bat)$/i.test(line));
    if (shim) {
      return shim;
    }
  }
  return lines[0];
}

function resolveCodexBinary(): ResolvedBinary {
  if (cachedBinary) {
    return cachedBinary;
  }
  const fromEnv = process.env.ADHD_CODEX_PATH;
  if (fromEnv && fromEnv.trim() !== "") {
    const envPath = fromEnv.trim();
    if (!existsSync(envPath)) {
      throw new Error(`ADHD_CODEX_PATH points to a missing file: ${envPath}`);
    }
    cachedBinary = { path: envPath, source: "env" };
    return cachedBinary;
  }
  try {
    const lookup = process.platform === "win32" ? "where" : "which";
    const output = execFileSync(lookup, ["codex"], { encoding: "utf8" });
    const first = pickBinaryLine(output);
    if (first) {
      cachedBinary = { path: first, source: "path" };
      return cachedBinary;
    }
  } catch {}
  throw new Error(INSTALL_HINT);
}

const ERROR_HINTS: Array<{ pattern: RegExp; message: string }> = [
  {
    pattern: /not logged in|logged out|please (?:run|use).*login|run `?codex login`?|unauthorized|\b401\b/i,
    message:
      "Codex CLI isn't logged in. Run `codex login` in a terminal (ChatGPT subscription), " +
      "or add an OpenAI API key in Setup → Connection.",
  },
  {
    pattern: /invalid.*api.?key|incorrect api key|invalid_api_key|authentication (?:failed|error)/i,
    message: "Invalid OpenAI API key — update it in Setup → Connection.",
  },
  {
    pattern: /insufficient_quota|quota exceeded|rate limit|billing|exceeded your current quota/i,
    message:
      "OpenAI quota or rate limit reached — check your plan, or switch connection mode in Setup → Connection.",
  },
  {
    pattern: /model.*(?:not|un)available|unknown model|model_not_found|does not exist|no access to (?:the )?model/i,
    message:
      "Model not available on your account — switch the model in Setup → AI Harness.",
  },
];

function mapKnownError(raw: string): string | undefined {
  return ERROR_HINTS.find((hint) => hint.pattern.test(raw))?.message;
}

function buildChildEnv(connection?: EngineConnection): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.OPENAI_API_KEY;
  if (connection?.mode === "api-key" && connection.apiKey) {
    env.OPENAI_API_KEY = connection.apiKey;
  }
  return env;
}

function buildArgs(ctx: EngineRunContext): string[] {
  if (ctx.resumeSessionId) {
    return buildResumeArgs(ctx, ctx.resumeSessionId);
  }
  return [
    "exec",
    "--json",
    "--skip-git-repo-check",
    ...(ctx.permissionMode === "acceptEdits"
      ? ["--sandbox", "workspace-write"]
      : ["--dangerously-bypass-approvals-and-sandbox"]),
    ...(ctx.model ? ["--model", ctx.model] : []),
    "-",
  ];
}

function buildResumeArgs(ctx: EngineRunContext, sessionId: string): string[] {
  return [
    "exec",
    "resume",
    sessionId,
    "--json",
    "--skip-git-repo-check",
    ...(ctx.permissionMode === "acceptEdits"
      ? []
      : ["--dangerously-bypass-approvals-and-sandbox"]),
    ...(ctx.model ? ["--model", ctx.model] : []),
    "-",
  ];
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function readCodexConfigModel(): string | undefined {
  const configPath = path.join(os.homedir(), ".codex", "config.toml");
  let text: string;
  try {
    text = readFileSync(configPath, "utf8");
  } catch {
    return undefined;
  }
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith("[")) {
      break;
    }
    const match = /^model\s*=\s*["']([^"']+)["']/.exec(trimmed);
    if (match) {
      return match[1];
    }
  }
  return undefined;
}

export const codexAdapter: EngineAdapter = {
  id: "codex",

  async listModels(): Promise<EngineModelList> {
    const configured = readCodexConfigModel();
    if (!configured) {
      return {
        options: CODEX_MODEL_OPTIONS,
        source: "static",
        note: "No model set in ~/.codex/config.toml — Auto uses the CLI's built-in default.",
      };
    }
    const known = CODEX_MODEL_OPTIONS.some((option) => option.id === configured);
    return {
      options: known
        ? CODEX_MODEL_OPTIONS
        : [
            ...CODEX_MODEL_OPTIONS,
            { id: configured, label: configured, hint: "from your ~/.codex/config.toml" },
          ],
      source: "config",
      note: `Your Codex CLI is configured for "${configured}" — Auto uses it.`,
    };
  },

  async detect(): Promise<EngineStatus> {
    cachedBinary = undefined;
    let resolved: ResolvedBinary;
    try {
      resolved = resolveCodexBinary();
    } catch (error) {
      return {
        engine: "codex",
        installed: false,
        message: errorText(error),
        installCommand: INSTALL_COMMAND,
        docsUrl: DOCS_URL,
      };
    }
    const version = await probeCommand(resolved.path, ["--version"]);
    if (!version.success) {
      const reason = version.errorMessage ?? version.stderrTail.join(" ").trim();
      return {
        engine: "codex",
        installed: false,
        path: resolved.path,
        source: resolved.source,
        message: `Found ${resolved.path} but "--version" failed: ${truncate(reason)}`,
        installCommand: INSTALL_COMMAND,
        docsUrl: DOCS_URL,
      };
    }
    const auth = await probeCommand(resolved.path, ["login", "status"]);
    const authText = firstLine(auth.stdout) ?? firstLine(auth.stderrTail.join("\n"));
    const loggedIn = auth.success
      ? true
      : authText && /not logged in|logged out|no.*credentials/i.test(authText)
        ? false
        : undefined;
    return {
      engine: "codex",
      installed: true,
      path: resolved.path,
      version: firstLine(version.stdout),
      source: resolved.source,
      message: truncate(authText ?? "auth status unknown — run `codex login` in a terminal"),
      loggedIn,
    };
  },

  async install(): Promise<EngineActionResult> {
    const npm = process.platform === "win32" ? "npm.cmd" : "npm";
    const result = await runSubprocess({
      command: npm,
      args: ["install", "-g", "@openai/codex"],
      cwd: os.homedir(),
      timeoutMs: 300_000,
    });
    if (result.success) {
      cachedBinary = undefined;
      return {
        ok: true,
        output: firstLine(result.stdout),
        message: "Codex CLI installed. Run `codex login` next.",
      };
    }
    const reason = result.timedOut
      ? "Installer timed out after 300s"
      : result.stderrTail.join(" ").trim() || result.errorMessage || "npm install failed";
    return { ok: false, output: firstLine(result.stdout), message: truncate(reason) };
  },

  async run(ctx: EngineRunContext): Promise<EngineRunResult> {
    let binary: string;
    try {
      binary = resolveCodexBinary().path;
    } catch (error) {
      const message = errorText(error);
      ctx.onLog("fail", message);
      return { success: false, exitCode: null, errorMessage: message };
    }

    if (ctx.permissionMode === "acceptEdits") {
      ctx.onLog("info", "Codex has no accept-edits-only headless mode — running with --sandbox workspace-write");
    }

    const runCtx = withPersonaPrompt(ctx);

    const capture: EngineProtocolUpdate = {
      sessionId: ctx.resumeSessionId,
      logs: [],
    };
    const result = await runSubprocess({
      command: binary,
      args: buildArgs(runCtx),
      cwd: ctx.cwd,
      env: buildChildEnv(ctx.connection),
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
        const parsed = parseCodexProtocolLine(trimmed);
        if (!parsed.ok) {
          ctx.onLog("warn", protocolProblemMessage(parsed.problem));
          return;
        }
        applyProtocolUpdate(capture, parsed.event, ctx.onLog);
      },
    });

    const success =
      result.success &&
      capture.terminal === "success" &&
      capture.error === undefined;
    let errorMessage: string | undefined;
    if (!success) {
      if (result.timedOut) {
        errorMessage = `Timed out after ${Math.round(ctx.timeoutMs / 1000)}s`;
      } else if (result.aborted) {
        errorMessage = "Aborted";
      } else if (
        result.exitCode === null &&
        capture.terminal === undefined &&
        capture.error === undefined
      ) {
        errorMessage = result.errorMessage ?? "Failed to start Codex CLI";
        ctx.onLog("fail", errorMessage);
      } else {
        const stderr = result.stderrTail.join(" ").trim();
        const raw =
          capture.error ??
          `Codex exited with code ${result.exitCode}${stderr ? ` — ${stderr}` : ""}`;
        const mapped = mapKnownError(stderr ? `${raw}\n${stderr}` : raw);
        if (mapped) {
          ctx.onLog("warn", truncate(raw));
          errorMessage = mapped;
        } else {
          errorMessage = truncate(raw);
        }
      }
    }

    return {
      success,
      result: capture.output,
      sessionId: capture.sessionId,
      exitCode: result.exitCode,
      errorMessage,
      usage: capture.usage
        ? { ...capture.usage, durationMs: result.durationMs, turns: 1 }
        : undefined,
    };
  },
};

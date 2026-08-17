import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AutoReviewSupport, EngineLimit, EngineStatus, ModelOptionDraft } from "@isotopy/core";
import { detectEngineLimit } from "../domain/rules/engine-limit.ts";
import type { PermissionPlan, PermissionStrategy } from "../domain/rules/permission-plan.ts";
import { codexConfigModel } from "../schemas/engine-cli-config.ts";
import { NO_LIVE_LISTING, configuredModelFrom } from "./cli-config.ts";
import { parseCodexProtocolLine } from "./codex-protocol.ts";
import { firstLine, truncate, withStderr } from "./log-text.ts";
import { toolCacheEnv } from "./tool-cache.ts";
import { withPersonaPrompt } from "./persona.ts";
import { resolvePermissionPlan } from "./permission-mode.ts";
import { probeCommand, runSubprocess } from "./subprocess.ts";
import {
  applyProtocolUpdate,
  protocolProblemMessage,
} from "./protocol-validation.ts";
import type { EngineProtocolUpdate } from "./protocol-validation.ts";
import type {
  EngineActionResult,
  EngineAdapter,
  LiveModelLayer,
  EngineConnection,
  EngineRunContext,
  EngineRunResult,
} from "./types.ts";

const INSTALL_COMMAND = "npm install -g @openai/codex";
const DOCS_URL = "https://developers.openai.com/codex/cli";

const INSTALL_HINT =
  `Codex CLI not found. Install it (${INSTALL_COMMAND}), then run \`codex login\` once. ` +
  "Or set ISOTOPY_CODEX_PATH to the codex executable.";

interface ResolvedBinary {
  path: string;
  source: "env" | "path";
}

let cachedBinary: ResolvedBinary | undefined;

const WORKSPACE_SANDBOX = ["--sandbox", "workspace-write"];

const WORKSPACE_SANDBOX_CONFIG = ["-c", 'sandbox_mode="workspace-write"'];

const AUTO_REVIEW_CONFIG = [
  "-c",
  'approval_policy="on-request"',
  "-c",
  'approvals_reviewer="auto_review"',
];

const AUTO_REVIEW_CONFIGURABLE = (): Promise<AutoReviewSupport> => Promise.resolve("available");

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
  const fromEnv = process.env.ISOTOPY_CODEX_PATH;
  if (fromEnv && fromEnv.trim() !== "") {
    const envPath = fromEnv.trim();
    if (!existsSync(envPath)) {
      throw new Error(`ISOTOPY_CODEX_PATH points to a missing file: ${envPath}`);
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
    pattern: /insufficient_quota|quota exceeded|billing|exceeded your current quota/i,
    message:
      "OpenAI quota exhausted — check your plan and billing, or switch connection mode in Setup → Connection.",
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

function buildChildEnv(
  connection: EngineConnection | undefined,
  toolCacheDir: string | undefined,
): NodeJS.ProcessEnv {
  const env = { ...process.env, ...toolCacheEnv(toolCacheDir) };
  delete env.OPENAI_API_KEY;
  if (connection?.mode === "api-key" && connection.apiKey) {
    env.OPENAI_API_KEY = connection.apiKey;
  }
  return env;
}

function permissionArgs(strategy: PermissionStrategy): string[] {
  switch (strategy) {
    case "unrestricted":
      return ["--dangerously-bypass-approvals-and-sandbox"];
    case "autoReview":
      return [...WORKSPACE_SANDBOX, ...AUTO_REVIEW_CONFIG];
    case "acceptEdits":
      return WORKSPACE_SANDBOX;
    default: {
      const unreachable: never = strategy;
      return unreachable;
    }
  }
}

function resumePermissionArgs(strategy: PermissionStrategy): string[] {
  switch (strategy) {
    case "unrestricted":
      return ["--dangerously-bypass-approvals-and-sandbox"];
    case "autoReview":
      return [...WORKSPACE_SANDBOX_CONFIG, ...AUTO_REVIEW_CONFIG];
    case "acceptEdits":
      return WORKSPACE_SANDBOX_CONFIG;
    default: {
      const unreachable: never = strategy;
      return unreachable;
    }
  }
}

function buildArgs(ctx: EngineRunContext, plan: PermissionPlan): string[] {
  if (ctx.resumeSessionId) {
    return buildResumeArgs(ctx, ctx.resumeSessionId, plan);
  }
  return [
    "exec",
    "--json",
    "--skip-git-repo-check",
    ...permissionArgs(plan.strategy),
    ...(ctx.model ? ["--model", ctx.model] : []),
    ...reasoningEffortArgs(ctx),
    "-",
  ];
}

function reasoningEffortArgs(ctx: EngineRunContext): string[] {
  return ctx.effort ? ["-c", `model_reasoning_effort="${ctx.effort}"`] : [];
}

function buildResumeArgs(
  ctx: EngineRunContext,
  sessionId: string,
  plan: PermissionPlan,
): string[] {
  return [
    "exec",
    "resume",
    sessionId,
    "--json",
    "--skip-git-repo-check",
    ...resumePermissionArgs(plan.strategy),
    ...(ctx.model ? ["--model", ctx.model] : []),
    ...reasoningEffortArgs(ctx),
    "-",
  ];
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const codexAdapter: EngineAdapter = {
  id: "codex",

  liveModels(): Promise<LiveModelLayer> {
    return Promise.resolve(NO_LIVE_LISTING);
  },

  configuredModel(): ModelOptionDraft | undefined {
    return configuredModelFrom(
      path.join(os.homedir(), ".codex", "config.toml"),
      codexConfigModel,
      "from your ~/.codex/config.toml",
    );
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
      ctx.onLog({ level: "fail", message });
      return { success: false, exitCode: null, errorMessage: message };
    }

    const plan = await resolvePermissionPlan("codex", ctx, AUTO_REVIEW_CONFIGURABLE);

    const runCtx = withPersonaPrompt(ctx);

    const capture: EngineProtocolUpdate = {
      sessionId: ctx.resumeSessionId,
      logs: [],
    };
    const result = await runSubprocess({
      command: binary,
      args: buildArgs(runCtx, plan),
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
        const parsed = parseCodexProtocolLine(trimmed);
        if (!parsed.ok) {
          ctx.onLog({ level: "warn", message: protocolProblemMessage(parsed.problem) });
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
    let limit: EngineLimit | undefined;
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
        ctx.onLog({ level: "fail", message: errorMessage });
      } else {
        const stderr = result.stderrTail.join(" ").trim();
        const raw =
          capture.error ??
          `Codex exited with code ${result.exitCode}${stderr ? ` — ${stderr}` : ""}`;
        const detail = withStderr(raw, stderr);
        limit = detectEngineLimit("codex", truncate(detail));
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
      usage: capture.usage
        ? { ...capture.usage, durationMs: result.durationMs, turns: 1 }
        : undefined,
    };
  },
};

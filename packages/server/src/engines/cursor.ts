import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AutoReviewSupport, EngineLimit, EngineStatus, ModelOptionDraft } from "@isotopy/core";
import { detectEngineLimit } from "../domain/rules/engine-limit.ts";
import { cursorCliConfigModel, parseCursorModels } from "../schemas/engine-cli-config.ts";
import { configuredModelFrom } from "./cli-config.ts";
import { parseCursorProtocolLine } from "./cursor-protocol.ts";
import { firstLine, truncate, withStderr } from "./log-text.ts";
import { toolCacheEnv } from "./tool-cache.ts";
import { withPersonaPrompt } from "./persona.ts";
import { resolvePermissionPlan } from "./permission-mode.ts";
import { commandNeedsWindowsShell, probeCommand, runSubprocess } from "./subprocess.ts";
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

const PATH_CANDIDATES = ["cursor-agent", "agent"];

const AUTO_REVIEW_UNREACHABLE = (): Promise<AutoReviewSupport> =>
  Promise.resolve("unsupported");

const INSTALL_COMMAND = "irm 'https://cursor.com/install?win32=true' | iex";
const DOCS_URL = "https://cursor.com/docs/cli/installation";

const INSTALL_HINT =
  `Install it (PowerShell: ${INSTALL_COMMAND}), ` +
  "then run `agent login` once. Or set ISOTOPY_CURSOR_PATH to the executable.";

function isCursorIdeInstalled(): boolean {
  if (existsSync(path.join("C:", "Program Files", "cursor"))) {
    return true;
  }
  const localApp = process.env.LOCALAPPDATA;
  if (localApp && existsSync(path.join(localApp, "Programs", "cursor"))) {
    return true;
  }
  return false;
}

const PROMPT_ARG_WARN_LENGTH = 30_000;

interface ResolvedBinary {
  path: string;
  source: "env" | "path" | "install-dir";
}

let cachedBinary: ResolvedBinary | undefined;

function installDirs(): string[] {
  const dirs = [path.join(os.homedir(), ".local", "bin")];
  const localApp = process.env.LOCALAPPDATA;
  if (localApp) {
    dirs.push(path.join(localApp, "cursor-agent"));
  }
  return dirs;
}

function findInstallDirBinary(): string | undefined {
  const extensions = process.platform === "win32" ? [".cmd", ".exe", ""] : [""];
  for (const dir of installDirs()) {
    for (const name of PATH_CANDIDATES) {
      for (const ext of extensions) {
        const candidate = path.join(dir, name + ext);
        if (existsSync(candidate)) {
          return candidate;
        }
      }
    }
  }
  return undefined;
}

function resolveCursorBinary(): ResolvedBinary {
  if (cachedBinary) {
    return cachedBinary;
  }
  const fromEnv = process.env.ISOTOPY_CURSOR_PATH;
  if (fromEnv && fromEnv.trim() !== "") {
    const envPath = fromEnv.trim();
    if (!existsSync(envPath)) {
      throw new Error(`ISOTOPY_CURSOR_PATH points to a missing file: ${envPath}`);
    }
    cachedBinary = { path: envPath, source: "env" };
    return cachedBinary;
  }
  const lookup = process.platform === "win32" ? "where" : "which";
  for (const name of PATH_CANDIDATES) {
    try {
      const output = execFileSync(lookup, [name], { encoding: "utf8" });
      const first = firstLine(output);
      if (first) {
        cachedBinary = { path: first, source: "path" };
        return cachedBinary;
      }
    } catch {
      continue;
    }
  }
  const fromInstallDir = findInstallDirBinary();
  if (fromInstallDir) {
    cachedBinary = { path: fromInstallDir, source: "install-dir" };
    return cachedBinary;
  }
  throw new Error(
    "Cursor CLI not found (tried ISOTOPY_CURSOR_PATH, " +
      `${PATH_CANDIDATES.join("/")} on PATH, ${installDirs().join(", ")}). ` +
      INSTALL_HINT,
  );
}

const ERROR_HINTS: Array<{ pattern: RegExp; message: string }> = [
  {
    pattern: /not (?:logged|signed) in|login required|please (?:run|use).*login|authentication required|unauthorized/i,
    message:
      "Cursor CLI isn't logged in. Click Log in to Cursor in Setup → AI Harness " +
      "(or configure a Cursor API key there).",
  },
  {
    pattern: /invalid.*api.?key|authentication (?:failed|error)|\b401\b/i,
    message: "Invalid Cursor API key — update it in Setup → Connection.",
  },
  {
    pattern: /model.*(?:not|un)available|unknown model|no access to (?:the )?model/i,
    message:
      "Model not available on your Cursor plan — switch the model (try Auto) in Setup → AI Harness.",
  },
  {
    pattern: /quota exceeded/i,
    message:
      "Cursor quota exhausted — check your plan, or switch connection mode in Setup → Connection.",
  },
  {
    pattern: /unknown (?:option|argument)|unrecognized (?:option|argument)/i,
    message:
      "Your Cursor CLI doesn't recognize a flag we pass. Try ISOTOPY_CURSOR_TRUST=0, " +
      "adjust ISOTOPY_CURSOR_ARGS, or update the CLI (`agent update`).",
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
  delete env.CURSOR_API_KEY;
  if (connection?.mode === "api-key" && connection.apiKey) {
    env.CURSOR_API_KEY = connection.apiKey;
  }
  return env;
}

function promptGoesInArgs(binary: string): boolean {
  if (commandNeedsWindowsShell(binary)) {
    return false;
  }
  return process.env.ISOTOPY_CURSOR_PROMPT_VIA !== "stdin";
}

function buildArgs(ctx: EngineRunContext, promptViaArg: boolean): string[] {
  const extra = (process.env.ISOTOPY_CURSOR_ARGS ?? "").split(/\s+/).filter(Boolean);
  return [
    "-p",
    "--output-format",
    "stream-json",
    "--force",
    ...(process.env.ISOTOPY_CURSOR_TRUST === "0" ? [] : ["--trust"]),
    ...(ctx.model ? ["--model", ctx.model] : []),
    ...extra,
    ...(promptViaArg ? [ctx.prompt] : []),
  ];
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const cursorAdapter: EngineAdapter = {
  id: "cursor",

  configuredModel(): ModelOptionDraft | undefined {
    return configuredModelFrom(
      path.join(os.homedir(), ".cursor", "cli-config.json"),
      cursorCliConfigModel,
      "from your ~/.cursor/cli-config.json",
    );
  },

  async liveModels(): Promise<LiveModelLayer> {
    let binary: string;
    try {
      binary = resolveCursorBinary().path;
    } catch {
      return { options: [], note: "Cursor CLI not found." };
    }
    const result = await probeCommand(binary, ["models"]);
    const options = result.success ? parseCursorModels(result.stdout) : [];
    return options.length > 0
      ? { options }
      : { options: [], note: "`agent models` returned nothing usable." };
  },

  async detect(): Promise<EngineStatus> {
    cachedBinary = undefined;
    let resolved: ResolvedBinary;
    try {
      resolved = resolveCursorBinary();
    } catch (error) {
      const ide = isCursorIdeInstalled()
        ? "Cursor IDE is installed, but its headless Agent CLI is a separate tool and isn't installed yet. "
        : "";
      return {
        engine: "cursor",
        installed: false,
        message: `${ide}${errorText(error)}`,
        installCommand: INSTALL_COMMAND,
        docsUrl: DOCS_URL,
      };
    }
    const version = await probeCommand(resolved.path, ["--version"]);
    if (!version.success) {
      const reason = version.errorMessage ?? version.stderrTail.join(" ").trim();
      return {
        engine: "cursor",
        installed: false,
        path: resolved.path,
        source: resolved.source,
        message: `Found ${resolved.path} but "--version" failed: ${truncate(reason)}`,
        installCommand: INSTALL_COMMAND,
        docsUrl: DOCS_URL,
      };
    }
    const auth = await probeCommand(resolved.path, ["status"]);
    const authText = firstLine(auth.stdout) ?? firstLine(auth.stderrTail.join("\n"));
    const loggedIn = authText ? !/not logged in|logged out|no.*auth/i.test(authText) : undefined;
    return {
      engine: "cursor",
      installed: true,
      path: resolved.path,
      version: firstLine(version.stdout),
      source: resolved.source,
      message: truncate(authText ?? "auth status unknown — click Log in to Cursor"),
      loggedIn,
    };
  },

  async install(): Promise<EngineActionResult> {
    if (process.platform !== "win32") {
      return {
        ok: false,
        message: `Auto-install is Windows-only — install manually: ${INSTALL_COMMAND} (see ${DOCS_URL}).`,
      };
    }
    const result = await runSubprocess({
      command: "powershell.exe",
      args: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", INSTALL_COMMAND],
      cwd: os.homedir(),
      timeoutMs: 180_000,
    });
    if (result.success) {
      cachedBinary = undefined;
      return {
        ok: true,
        output: firstLine(result.stdout),
        message: "Cursor CLI installed. Run `agent login` next.",
      };
    }
    const reason = result.timedOut
      ? "Installer timed out after 180s"
      : (result.stderrTail.join(" ").trim() || result.errorMessage || "Installer failed");
    return { ok: false, output: firstLine(result.stdout), message: truncate(reason) };
  },

  async login(): Promise<EngineActionResult> {
    let binary: string;
    try {
      binary = resolveCursorBinary().path;
    } catch (error) {
      return { ok: false, message: errorText(error) };
    }
    const result = await runSubprocess({
      command: binary,
      args: ["login"],
      cwd: os.homedir(),
      timeoutMs: 300_000,
    });
    if (result.success) {
      return {
        ok: true,
        output: firstLine(result.stdout),
        message: "Logged in to Cursor.",
      };
    }
    const reason = result.timedOut
      ? "Login timed out — finish the browser sign-in, then Re-check."
      : (result.stderrTail.join(" ").trim() || result.errorMessage || "Login failed");
    return { ok: false, output: firstLine(result.stdout), message: truncate(reason) };
  },

  async run(ctx: EngineRunContext): Promise<EngineRunResult> {
    let binary: string;
    try {
      binary = resolveCursorBinary().path;
    } catch (error) {
      const message = errorText(error);
      ctx.onLog({ level: "fail", message });
      return { success: false, exitCode: null, errorMessage: message };
    }

    const runCtx = withPersonaPrompt(ctx);

    const promptViaArg = promptGoesInArgs(binary);
    await resolvePermissionPlan("cursor", ctx, AUTO_REVIEW_UNREACHABLE);
    if (promptViaArg && runCtx.prompt.length > PROMPT_ARG_WARN_LENGTH) {
      ctx.onLog({ level: "warn", message: "Prompt near the command-line length limit — set ISOTOPY_CURSOR_PROMPT_VIA=stdin" });
    }

    const capture: EngineProtocolUpdate = { logs: [] };
    const result = await runSubprocess({
      command: binary,
      args: buildArgs(runCtx, promptViaArg),
      cwd: ctx.cwd,
      env: buildChildEnv(ctx.connection, ctx.toolCacheDir),
      input: promptViaArg ? undefined : runCtx.prompt,
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
        const parsed = parseCursorProtocolLine(trimmed);
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
        errorMessage = result.errorMessage ?? "Failed to start Cursor CLI";
        ctx.onLog({ level: "fail", message: errorMessage });
      } else {
        const stderr = result.stderrTail.join(" ").trim();
        const raw =
          capture.terminal === "failure"
            ? (capture.error ??
              `Cursor ended with ${capture.terminalLabel ?? "an error"}`)
            : `Cursor exited with code ${result.exitCode}${stderr ? ` — ${stderr}` : ""}`;
        const detail = withStderr(raw, stderr);
        limit = detectEngineLimit("cursor", truncate(detail));
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
      exitCode: result.exitCode,
      errorMessage,
      limit,
      usage: {
        ...capture.usage,
        durationMs: capture.usage?.durationMs ?? result.durationMs,
        turns: 1,
      },
    };
  },
};

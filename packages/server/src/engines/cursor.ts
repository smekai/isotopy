import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { AUTO_MODEL_OPTION, CURSOR_MODEL_OPTIONS } from "@adhd/core";
import type { EngineModelList, EngineModelOption, EngineStatus } from "@adhd/core";
import { firstLine, truncate } from "./log-text.js";
import { withPersonaPrompt } from "./persona.js";
import { probeCommand, runSubprocess } from "./subprocess.js";
import type {
  EngineActionResult,
  EngineAdapter,
  EngineConnection,
  EngineRunContext,
  EngineRunResult,
} from "./types.js";

/** Newer installs name the binary `agent`; older ones `cursor-agent`. The
 * unambiguous name goes first — a bare `agent` on PATH could be anything. */
const PATH_CANDIDATES = ["cursor-agent", "agent"];

/** Official one-liner; also what the Setup "copy install command" button copies. */
const INSTALL_COMMAND = "irm 'https://cursor.com/install?win32=true' | iex";
const DOCS_URL = "https://cursor.com/docs/cli/installation";

const INSTALL_HINT =
  `Install it (PowerShell: ${INSTALL_COMMAND}), ` +
  "then run `agent login` once. Or set ADHD_CURSOR_PATH to the executable.";

/**
 * The Cursor *IDE* is a different tool from the headless Agent CLI — users who
 * have the editor installed are surprised by "not found". Detect the IDE so the
 * message can say so explicitly.
 */
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

/** Windows arg limit is ~32K; positional prompts near it need the stdin knob. */
const PROMPT_ARG_WARN_LENGTH = 30_000;

interface ResolvedBinary {
  path: string;
  source: "env" | "path" | "install-dir";
}

let cachedBinary: ResolvedBinary | undefined;

/** Directories the installer drops the binary into — checked directly so a
 * fresh install is found even when the running server's PATH predates it. */
function installDirs(): string[] {
  const dirs = [path.join(os.homedir(), ".local", "bin")];
  const localApp = process.env.LOCALAPPDATA;
  if (localApp) {
    dirs.push(path.join(localApp, "cursor-agent")); // Windows installer target
  }
  return dirs;
}

function findInstallDirBinary(): string | undefined {
  // The Windows install ships .cmd shims (no bare .exe); prefer them.
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
  const fromEnv = process.env.ADHD_CURSOR_PATH;
  if (fromEnv && fromEnv.trim() !== "") {
    const envPath = fromEnv.trim();
    if (!existsSync(envPath)) {
      throw new Error(`ADHD_CURSOR_PATH points to a missing file: ${envPath}`);
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
      // not on PATH — try the next candidate
    }
  }
  const fromInstallDir = findInstallDirBinary();
  if (fromInstallDir) {
    cachedBinary = { path: fromInstallDir, source: "install-dir" };
    return cachedBinary;
  }
  throw new Error(
    "Cursor CLI not found (tried ADHD_CURSOR_PATH, " +
      `${PATH_CANDIDATES.join("/")} on PATH, ${installDirs().join(", ")}). ` +
      INSTALL_HINT,
  );
}

/** Known CLI failure signatures mapped to actionable guidance. */
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
    pattern: /usage limit|rate limit|quota exceeded/i,
    message:
      "Cursor usage limit reached — wait for the reset, or switch connection mode in Setup → Connection.",
  },
  {
    pattern: /unknown (?:option|argument)|unrecognized (?:option|argument)/i,
    message:
      "Your Cursor CLI doesn't recognize a flag we pass. Try ADHD_CURSOR_TRUST=0, " +
      "adjust ADHD_CURSOR_ARGS, or update the CLI (`agent update`).",
  },
];

function mapKnownError(raw: string): string | undefined {
  return ERROR_HINTS.find((hint) => hint.pattern.test(raw))?.message;
}

/**
 * Environment for the spawned CLI. The Cursor key is stripped so a stray
 * CURSOR_API_KEY in the server env can't silently switch billing away from
 * the user's CLI login (subscription mode); api-key mode injects the stored key.
 */
function buildChildEnv(connection?: EngineConnection): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.CURSOR_API_KEY;
  if (connection?.mode === "api-key" && connection.apiKey) {
    env.CURSOR_API_KEY = connection.apiKey;
  }
  return env;
}

/**
 * Experimentation knobs (the Cursor CLI's headless behavior on Windows is
 * still being mapped out — these let the user try variants without code edits):
 * - ADHD_CURSOR_TRUST=0   drop --trust (on by default: fresh scratch
 *   workspaces would otherwise hit the workspace-trust prompt and hang).
 * - ADHD_CURSOR_ARGS      extra args appended verbatim (whitespace-split).
 * - ADHD_CURSOR_PROMPT_VIA=stdin   pipe the prompt instead of a positional arg.
 */
function buildArgs(ctx: EngineRunContext, promptViaArg: boolean): string[] {
  const extra = (process.env.ADHD_CURSOR_ARGS ?? "").split(/\s+/).filter(Boolean);
  return [
    "-p",
    "--output-format",
    "stream-json",
    // Headless runs must not stop for confirmation; Cursor has no
    // accept-edits-only equivalent, so both permission modes use --force.
    "--force",
    ...(process.env.ADHD_CURSOR_TRUST === "0" ? [] : ["--trust"]),
    ...(ctx.model ? ["--model", ctx.model] : []),
    ...extra,
    ...(promptViaArg ? [ctx.prompt] : []),
  ];
}

interface CursorStreamEvent {
  type?: string;
  subtype?: string;
  model?: string;
  result?: string;
  is_error?: boolean;
  duration_ms?: number;
  message?: {
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  };
  tool_call?: Record<string, unknown>;
}

/** The tool_call payload is tool-specific and loosely documented — probe common arg names. */
function toolCallSummary(toolCall: Record<string, unknown>): string {
  const name = Object.keys(toolCall)[0] ?? "tool";
  const inner = toolCall[name];
  const args =
    inner && typeof inner === "object"
      ? (((inner as Record<string, unknown>).args as Record<string, unknown> | undefined) ??
        (inner as Record<string, unknown>))
      : {};
  const detail = args.path ?? args.file_path ?? args.command ?? args.pattern ?? args.query ?? "";
  return truncate(`▶ ${name} ${String(detail)}`);
}

/**
 * Render one Cursor stream-json event to the run log. Returns the event when
 * it's the final `result` event so the caller can capture result/duration.
 */
function handleCursorEvent(
  event: CursorStreamEvent,
  onLog: EngineRunContext["onLog"],
): CursorStreamEvent | undefined {
  if (event.type === "system" && event.subtype === "init") {
    onLog("info", truncate(`Cursor agent online · ${event.model ?? "default model"}`));
    return undefined;
  }
  if (event.type === "assistant") {
    for (const item of event.message?.content ?? []) {
      if (item.type === "text" && item.text) {
        onLog("info", truncate(item.text));
      }
    }
    return undefined;
  }
  if (event.type === "tool_call" && event.subtype === "started" && event.tool_call) {
    onLog("run", toolCallSummary(event.tool_call));
    return undefined;
  }
  if (event.type === "result") {
    const secs = event.duration_ms !== undefined ? `${Math.round(event.duration_ms / 1000)}s` : "?";
    onLog("info", `done in ${secs}`);
    return event;
  }
  // "user" echo, tool_call completions, unknown types — ignore
  return undefined;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Parse `agent models` output. It prints an "Available models" banner followed
 * by one `<id> - <Label>` line per model, the active one tagged
 * "(current, default)". Unrecognised lines are skipped so a banner or footer
 * change doesn't poison the roster.
 */
function parseCursorModels(stdout: string): EngineModelOption[] {
  const options: EngineModelOption[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    const match = /^\s*([\w.:-]+)\s+-\s+(.+?)\s*$/.exec(line);
    if (!match) {
      continue;
    }
    const [, id, label] = match;
    const current = /\(current[^)]*\)/i.test(label);
    const clean = label.replace(/\s*\(current[^)]*\)\s*/i, "").trim() || id;
    options.push({
      id,
      // Cursor's own `auto` router model is a different thing from our Auto
      // (which sends no --model at all) — don't let both read "Auto".
      label: id === "auto" ? `Cursor ${clean}` : clean,
      hint: current ? "the CLI's current default" : "",
    });
  }
  return options;
}

export const cursorAdapter: EngineAdapter = {
  id: "cursor",

  /** Cursor's CLI can enumerate its own roster, so ask it rather than guessing. */
  async listModels(): Promise<EngineModelList> {
    let binary: string;
    try {
      binary = resolveCursorBinary().path;
    } catch {
      return {
        options: CURSOR_MODEL_OPTIONS,
        source: "static",
        note: "Cursor CLI not found — showing the built-in list.",
      };
    }
    const result = await probeCommand(binary, ["models"]);
    const parsed = result.success ? parseCursorModels(result.stdout) : [];
    if (parsed.length === 0) {
      return {
        options: CURSOR_MODEL_OPTIONS,
        source: "static",
        note: "`agent models` returned nothing usable — showing the built-in list.",
      };
    }
    // Our Auto (no --model at all) is distinct from Cursor's own `auto` router
    // model, so it is prepended rather than assumed to be in the CLI output.
    return { options: [AUTO_MODEL_OPTION, ...parsed], source: "cli" };
  },

  async detect(): Promise<EngineStatus> {
    cachedBinary = undefined; // re-check must pick up a newly installed CLI
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
    // Best-effort auth probe — surfaces login state in the status card.
    // `status` exits 0 either way, so the answer is in the text.
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
    // Runs the official installer, which on Windows drops the binary into
    // %LOCALAPPDATA%\cursor-agent — a location resolveCursorBinary() scans, so
    // a Re-check finds it without a server restart.
    const result = await runSubprocess({
      command: "powershell.exe",
      args: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", INSTALL_COMMAND],
      cwd: os.homedir(),
      timeoutMs: 180_000,
    });
    if (result.success) {
      cachedBinary = undefined; // force the next detect()/run to re-resolve
      return { ok: true, output: firstLine(result.stdout), message: "Cursor CLI installed. Run `agent login` next." };
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
    // `agent login` opens the browser on this machine and blocks until the
    // OAuth flow completes, then persists the token. The generous timeout is
    // the window for the user to finish in the browser.
    const result = await runSubprocess({
      command: binary,
      args: ["login"],
      cwd: os.homedir(),
      timeoutMs: 300_000,
    });
    if (result.success) {
      return { ok: true, output: firstLine(result.stdout), message: "Logged in to Cursor." };
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
      ctx.onLog("fail", message);
      return { success: false, exitCode: null, errorMessage: message };
    }

    // No system-prompt flag on the Cursor CLI — the persona rides in the prompt.
    const runCtx = withPersonaPrompt(ctx);

    const promptViaArg = process.env.ADHD_CURSOR_PROMPT_VIA !== "stdin";
    if (ctx.permissionMode === "acceptEdits") {
      ctx.onLog("info", "Cursor has no accept-edits-only headless mode — running with --force");
    }
    if (promptViaArg && runCtx.prompt.length > PROMPT_ARG_WARN_LENGTH) {
      ctx.onLog("warn", "Prompt near the command-line length limit — set ADHD_CURSOR_PROMPT_VIA=stdin");
    }

    let finalEvent: CursorStreamEvent | undefined;
    const result = await runSubprocess({
      command: binary,
      args: buildArgs(runCtx, promptViaArg),
      cwd: ctx.cwd,
      env: buildChildEnv(ctx.connection),
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
        try {
          const captured = handleCursorEvent(JSON.parse(trimmed) as CursorStreamEvent, ctx.onLog);
          if (captured) {
            finalEvent = captured;
          }
        } catch {
          // non-JSON output line — ignore
        }
      },
    });

    const success = result.success && finalEvent?.type === "result" && !finalEvent.is_error;
    let errorMessage: string | undefined;
    if (!success) {
      if (result.timedOut) {
        errorMessage = `Timed out after ${Math.round(ctx.timeoutMs / 1000)}s`;
      } else if (result.aborted) {
        errorMessage = "Aborted";
      } else if (result.exitCode === null && !finalEvent) {
        // The CLI never started (bad binary, etc.) — surface the spawn reason.
        errorMessage = result.errorMessage ?? "Failed to start Cursor CLI";
        ctx.onLog("fail", errorMessage);
      } else {
        const stderr = result.stderrTail.join(" ").trim();
        const raw =
          finalEvent && finalEvent.is_error
            ? (finalEvent.result ?? `Cursor ended with ${finalEvent.subtype}`)
            : `Cursor exited with code ${result.exitCode}${stderr ? ` — ${stderr}` : ""}`;
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
      // Cursor's result event carries no cost/turn fields — leave those undefined.
      durationMs: finalEvent?.duration_ms ?? result.durationMs,
    };
  },
};

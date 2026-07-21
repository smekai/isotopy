// Generic subprocess harness: runs any CLI command in a worktree, streaming
// output line-by-line, with a hard timeout and abort support, and kills the
// whole process tree on teardown. This is the reusable core the concrete engine
// adapters (Claude Code, and later Cursor/Codex) build on — they add binary
// resolution, argument construction, and output parsing on top.
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import os from "node:os";

/** How many trailing stderr lines to retain for failure diagnostics. */
const STDERR_TAIL_LINES = 10;
/** Grace period before escalating SIGTERM to SIGKILL on POSIX. */
const SIGKILL_ESCALATE_MS = 5000;

export type SubprocessStream = "stdout" | "stderr";

export interface SubprocessSpec {
  /** Executable to run — a resolved path or a bare name on PATH. */
  command: string;
  args?: string[];
  /** Working directory the command runs in (the worktree). */
  cwd: string;
  /** Full environment for the child. Defaults to the parent's. */
  env?: NodeJS.ProcessEnv;
  /** Written to the child's stdin, which is then closed (EOF). */
  input?: string;
  /** Hard cap on wall-clock runtime; the process tree is killed on expiry. */
  timeoutMs: number;
  /** Aborting terminates the process tree. */
  signal?: AbortSignal;
  /**
   * Force (or forbid) running through the Windows command interpreter. Defaults
   * to auto: Node >= 20 refuses to spawn `.cmd`/`.bat` shims directly, so those
   * are routed through `cmd.exe` with an explicitly quoted command line. Has no
   * effect off Windows, which has no such shims.
   */
  shell?: boolean;
  /** Called for each complete line of output as it streams in. */
  onLine?: (stream: SubprocessStream, line: string) => void;
}

export interface SubprocessResult {
  /** True only on a clean exit — code 0, not aborted, not timed out. */
  success: boolean;
  exitCode: number | null;
  /** Signal that terminated the process, if any. */
  termSignal: NodeJS.Signals | null;
  timedOut: boolean;
  aborted: boolean;
  /** Full captured stdout (consumers streaming huge output should use onLine). */
  stdout: string;
  /** Last few stderr lines, for surfacing failures. */
  stderrTail: string[];
  durationMs: number;
  /** Present when the command couldn't start or exited abnormally. */
  errorMessage?: string;
}

/**
 * Kill the whole process tree. child.kill() alone would orphan grandchildren
 * spawned under a Windows .cmd shim, so we use taskkill /T there.
 */
export function killProcessTree(child: ChildProcess): void {
  if (child.exitCode !== null || child.signalCode !== null || child.pid === undefined) {
    return;
  }
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"]);
  } else {
    child.kill("SIGTERM");
    const escalate = setTimeout(() => child.kill("SIGKILL"), SIGKILL_ESCALATE_MS);
    escalate.unref();
  }
}

/**
 * Buffer a stream and invoke `emit` for each complete line (CRLF-normalized,
 * empty lines skipped). Call with `flush` on close to emit any trailing partial.
 */
function createLineReader(emit: (line: string) => void): (chunk: string, flush?: boolean) => void {
  let buffer = "";
  return (chunk: string, flush = false): void => {
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = flush ? "" : (lines.pop() ?? "");
    for (const raw of lines) {
      const line = raw.replace(/\r$/, "");
      if (line !== "") {
        emit(line);
      }
    }
  };
}

/** Default ceiling for short informational CLI calls (--version, status, models). */
const PROBE_TIMEOUT_MS = 10_000;

/**
 * Run a short informational CLI command (`--version`, `login status`,
 * `models`). Goes through runSubprocess so it inherits the Windows `.cmd`
 * shim handling and the timeout/tree-kill behaviour; the home directory is used
 * as cwd so a probe never depends on a workspace existing.
 */
export function probeCommand(binary: string, args: string[]): Promise<SubprocessResult> {
  return runSubprocess({
    command: binary,
    args,
    cwd: os.homedir(),
    timeoutMs: PROBE_TIMEOUT_MS,
  });
}

/**
 * Windows batch shims (`.cmd`/`.bat`) can only be launched through the command
 * interpreter — Node >= 20 refuses to spawn them directly.
 */
export function commandNeedsWindowsShell(command: string): boolean {
  return process.platform === "win32" && /\.(cmd|bat)$/i.test(command);
}

function needsWindowsShell(spec: SubprocessSpec): boolean {
  if (spec.shell !== undefined) {
    return spec.shell && process.platform === "win32";
  }
  return commandNeedsWindowsShell(spec.command);
}

/**
 * Wrap one argument in double quotes using the C runtime's backslash rules, so
 * the child parses argv back exactly as given. Quoting also neutralises the
 * cmd metacharacters that matter for injection (`&`, `|`, `<`, `>`), which the
 * interpreter does not act on inside a quoted string — this is what makes it
 * safe to pass a stage persona (multi-line markdown) as an argument.
 *
 * Caveat, deliberately not faked: `%VAR%` is still expanded inside quotes, and
 * `^` cannot prevent it there. That can substitute an env value into an
 * argument, but cannot introduce a new command.
 */
function quoteWindowsArg(arg: string): string {
  const escaped = arg
    // Backslashes before a quote must be doubled, then the quote escaped.
    .replace(/(\\*)"/g, '$1$1\\"')
    // Trailing backslashes would otherwise escape our own closing quote.
    .replace(/(\\+)$/, "$1$1");
  return `"${escaped}"`;
}

/**
 * Decide what to actually hand to `spawn`. Normal executables take the argv
 * array untouched; Windows shims are run as a single quoted command line
 * through the interpreter, which keeps `shell: true` (and DEP0190) out of this
 * module entirely.
 */
function resolveSpawnTarget(spec: SubprocessSpec): { command: string; args: string[] } {
  const args = spec.args ?? [];
  if (!needsWindowsShell(spec)) {
    return { command: spec.command, args };
  }
  const commandLine = [spec.command, ...args].map(quoteWindowsArg).join(" ");
  return {
    command: process.env.ComSpec ?? "cmd.exe",
    // /d skips AutoRun scripts; /c runs and exits. /s plus the outer quote pair
    // is the documented way to keep our own quoting intact: cmd strips exactly
    // that outer pair and treats the remainder verbatim.
    args: ["/d", "/s", "/c", `"${commandLine}"`],
  };
}

/**
 * Run a command to completion. Never rejects: failures (spawn errors, non-zero
 * exit, timeout, abort) are reported in the resolved SubprocessResult.
 */
export function runSubprocess(spec: SubprocessSpec): Promise<SubprocessResult> {
  const startedAt = Date.now();

  // cmd.exe ends a command at a line break, so a multi-line argument would be
  // silently truncated. Fail loudly instead — callers with long text (a stage
  // persona) must send it via stdin on this path.
  if (needsWindowsShell(spec) && (spec.args ?? []).some((arg) => /[\r\n]/.test(arg))) {
    return Promise.resolve({
      success: false,
      exitCode: null,
      termSignal: null,
      timedOut: false,
      aborted: false,
      stdout: "",
      stderrTail: [],
      durationMs: 0,
      errorMessage:
        "Multi-line argument cannot be passed through a Windows .cmd/.bat shim — send it via stdin instead.",
    });
  }

  const { command, args } = resolveSpawnTarget(spec);

  return new Promise<SubprocessResult>((resolve) => {
    let child: ChildProcess;
    try {
      child = spawn(command, args, {
        cwd: spec.cwd,
        // Never `shell: true` with an args array — Node would concatenate them
        // unescaped (DEP0190). resolveSpawnTarget already built a quoted
        // command line for the shim case.
        windowsVerbatimArguments: needsWindowsShell(spec),
        env: spec.env,
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (error) {
      // spawn can throw synchronously (e.g. a non-existent cwd).
      resolve({
        success: false,
        exitCode: null,
        termSignal: null,
        timedOut: false,
        aborted: spec.signal?.aborted ?? false,
        stdout: "",
        stderrTail: [],
        durationMs: Date.now() - startedAt,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    let settled = false;
    let stdout = "";
    let stderrTail: string[] = [];
    let timedOut = false;
    let spawnErrorMessage: string | undefined;

    const readStdout = createLineReader((line) => spec.onLine?.("stdout", line));
    const readStderr = createLineReader((line) => {
      spec.onLine?.("stderr", line);
      stderrTail = [...stderrTail, line].slice(-STDERR_TAIL_LINES);
    });

    const finish = (result: SubprocessResult): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      spec.signal?.removeEventListener("abort", onAbort);
      resolve(result);
    };

    const onAbort = (): void => killProcessTree(child);
    if (spec.signal?.aborted) {
      killProcessTree(child); // aborted before we got here — tear down now
    } else {
      spec.signal?.addEventListener("abort", onAbort, { once: true });
    }

    const timeout = setTimeout(() => {
      timedOut = true;
      killProcessTree(child);
    }, spec.timeoutMs);
    timeout.unref();

    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      stdout += chunk;
      readStdout(chunk);
    });
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => readStderr(chunk));

    child.on("error", (error) => {
      spawnErrorMessage = `Failed to start process: ${error.message}`;
      finish({
        success: false,
        exitCode: null,
        termSignal: null,
        timedOut,
        aborted: spec.signal?.aborted ?? false,
        stdout,
        stderrTail,
        durationMs: Date.now() - startedAt,
        errorMessage: spawnErrorMessage,
      });
    });

    child.on("close", (code, termSignal) => {
      readStdout("", true);
      readStderr("", true);
      const aborted = spec.signal?.aborted ?? false;
      const success = code === 0 && !timedOut && !aborted && spawnErrorMessage === undefined;
      let errorMessage: string | undefined;
      if (!success) {
        if (timedOut) {
          errorMessage = `Timed out after ${Math.round(spec.timeoutMs / 1000)}s`;
        } else if (aborted) {
          errorMessage = "Aborted";
        } else if (spawnErrorMessage) {
          errorMessage = spawnErrorMessage;
        } else {
          const tail = stderrTail.join(" ").trim();
          errorMessage = `Process exited with code ${code}${tail ? ` — ${tail}` : ""}`;
        }
      }
      finish({
        success,
        exitCode: code,
        termSignal: termSignal ?? null,
        timedOut,
        aborted,
        stdout,
        stderrTail,
        durationMs: Date.now() - startedAt,
        errorMessage,
      });
    });

    // Feed stdin (if any) and close it so non-interactive commands see EOF.
    child.stdin?.on("error", () => {
      // The child may exit before we finish writing; 'close'/'error' handle it.
    });
    if (spec.input !== undefined) {
      child.stdin?.write(spec.input);
    }
    child.stdin?.end();
  });
}

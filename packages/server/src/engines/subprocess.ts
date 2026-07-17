// Generic subprocess harness: runs any CLI command in a worktree, streaming
// output line-by-line, with a hard timeout and abort support, and kills the
// whole process tree on teardown. This is the reusable core the concrete engine
// adapters (Claude Code, and later Cursor/Codex) build on — they add binary
// resolution, argument construction, and output parsing on top.
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";

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
   * Force (or forbid) a shell. Defaults to auto: Node >= 20 refuses to spawn
   * Windows .cmd/.bat shims without one, so they get a shell automatically.
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

/**
 * Run a command to completion. Never rejects: failures (spawn errors, non-zero
 * exit, timeout, abort) are reported in the resolved SubprocessResult.
 */
export function runSubprocess(spec: SubprocessSpec): Promise<SubprocessResult> {
  const startedAt = Date.now();
  // A shell parses the command string itself, so quote a path with spaces.
  const useShell = spec.shell ?? /\.(cmd|bat)$/i.test(spec.command);
  const command = useShell ? `"${spec.command}"` : spec.command;

  return new Promise<SubprocessResult>((resolve) => {
    let child: ChildProcess;
    try {
      child = spawn(command, spec.args ?? [], {
        cwd: spec.cwd,
        shell: useShell,
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

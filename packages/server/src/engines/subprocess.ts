import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import os from "node:os";

const STDERR_TAIL_LINES = 10;
const SIGKILL_ESCALATE_MS = 5000;

/**
 * `close` waits for every holder of the child's stdio to let go, and a coding
 * CLI that leaves a dev server behind never gets there. `exit` says the process
 * itself is gone; this is how long we still wait for its output to drain.
 */
const STDIO_FLUSH_GRACE_MS = 2000;

export type SubprocessStream = "stdout" | "stderr";

export interface SubprocessSpec {
  command: string;
  args?: string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
  input?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  shell?: boolean;
  onLine?: (stream: SubprocessStream, line: string) => void;
}

export interface SubprocessResult {
  success: boolean;
  exitCode: number | null;
  termSignal: NodeJS.Signals | null;
  timedOut: boolean;
  aborted: boolean;
  stdout: string;
  stderrTail: string[];
  durationMs: number;
  errorMessage?: string;
}

export interface SubprocessHandle {
  pid?: number;
  kill: () => void;
  exited: Promise<SubprocessResult>;
}

function ownsProcessGroup(): boolean {
  return process.platform !== "win32";
}

function signalGroup(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pid, signal);
  } catch {
    // The group is already gone, which is the outcome we wanted.
  }
}

export function killProcessTree(child: ChildProcess): void {
  if (child.exitCode !== null || child.signalCode !== null || child.pid === undefined) {
    return;
  }
  if (!ownsProcessGroup()) {
    spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"]);
    return;
  }
  const { pid } = child;
  signalGroup(pid, "SIGTERM");
  const escalate = setTimeout(() => signalGroup(pid, "SIGKILL"), SIGKILL_ESCALATE_MS);
  escalate.unref();
}

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

const PROBE_TIMEOUT_MS = 10_000;

export function probeCommand(binary: string, args: string[]): Promise<SubprocessResult> {
  return runSubprocess({
    command: binary,
    args,
    cwd: os.homedir(),
    timeoutMs: PROBE_TIMEOUT_MS,
  });
}

export function commandNeedsWindowsShell(command: string): boolean {
  return process.platform === "win32" && /\.(cmd|bat)$/i.test(command);
}

function needsWindowsShell(spec: SubprocessSpec): boolean {
  if (spec.shell !== undefined) {
    return spec.shell && process.platform === "win32";
  }
  return commandNeedsWindowsShell(spec.command);
}

function quoteWindowsArg(arg: string): string {
  const escaped = arg
    .replace(/(\\*)"/g, '$1$1\\"')
    .replace(/(\\+)$/, "$1$1");
  return `"${escaped}"`;
}

function resolveSpawnTarget(spec: SubprocessSpec): { command: string; args: string[] } {
  const args = spec.args ?? [];
  if (!needsWindowsShell(spec)) {
    return { command: spec.command, args };
  }
  const commandLine = [spec.command, ...args].map(quoteWindowsArg).join(" ");
  return {
    command: process.env.ComSpec ?? "cmd.exe",
    args: ["/d", "/s", "/c", `"${commandLine}"`],
  };
}

function startupFailure(
  errorMessage: string,
  aborted: boolean,
  durationMs: number,
): SubprocessResult {
  return {
    success: false,
    exitCode: null,
    termSignal: null,
    timedOut: false,
    aborted,
    stdout: "",
    stderrTail: [],
    durationMs,
    errorMessage,
  };
}

function settledHandle(result: SubprocessResult): SubprocessHandle {
  return { kill: () => {}, exited: Promise.resolve(result) };
}

const MULTILINE_SHIM_MESSAGE =
  "Multi-line argument cannot be passed through a Windows .cmd/.bat shim — send it via stdin instead.";

export function startSubprocess(spec: SubprocessSpec): SubprocessHandle {
  const startedAt = Date.now();

  if (needsWindowsShell(spec) && (spec.args ?? []).some((arg) => /[\r\n]/.test(arg))) {
    return settledHandle(startupFailure(MULTILINE_SHIM_MESSAGE, false, 0));
  }

  const { command, args } = resolveSpawnTarget(spec);

  let child: ChildProcess;
  try {
    child = spawn(command, args, {
      cwd: spec.cwd,
      windowsVerbatimArguments: needsWindowsShell(spec),
      env: spec.env,
      stdio: ["pipe", "pipe", "pipe"],
      detached: ownsProcessGroup(),
    });
  } catch (error) {
    return settledHandle(
      startupFailure(
        error instanceof Error ? error.message : String(error),
        spec.signal?.aborted ?? false,
        Date.now() - startedAt,
      ),
    );
  }

  let resolveExit!: (result: SubprocessResult) => void;
  const exited = new Promise<SubprocessResult>((resolve) => {
    resolveExit = resolve;
  });

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

  let flushGrace: NodeJS.Timeout | undefined;

  const finish = (result: SubprocessResult): void => {
    if (settled) {
      return;
    }
    settled = true;
    clearTimeout(timeout);
    clearTimeout(flushGrace);
    spec.signal?.removeEventListener("abort", onAbort);
    resolveExit(result);
  };

  const onAbort = (): void => killProcessTree(child);
  if (spec.signal?.aborted) {
    killProcessTree(child);
  } else {
    spec.signal?.addEventListener("abort", onAbort, { once: true });
  }

  const timeout =
    spec.timeoutMs === undefined
      ? undefined
      : setTimeout(() => {
          timedOut = true;
          killProcessTree(child);
        }, spec.timeoutMs);
  timeout?.unref();

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

  const settle = (code: number | null, termSignal: NodeJS.Signals | null): void => {
    readStdout("", true);
    readStderr("", true);
    const aborted = spec.signal?.aborted ?? false;
    const success = code === 0 && !timedOut && !aborted && spawnErrorMessage === undefined;
    let errorMessage: string | undefined;
    if (!success) {
      if (timedOut) {
        errorMessage = `Timed out after ${Math.round((spec.timeoutMs ?? 0) / 1000)}s`;
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
  };

  child.on("close", settle);
  child.on("exit", (code, termSignal) => {
    flushGrace = setTimeout(() => settle(code, termSignal), STDIO_FLUSH_GRACE_MS);
    flushGrace.unref();
  });

  child.stdin?.on("error", () => {});
  if (spec.input !== undefined) {
    child.stdin?.write(spec.input);
  }
  child.stdin?.end();

  return { pid: child.pid, kill: () => killProcessTree(child), exited };
}

export function runSubprocess(spec: SubprocessSpec): Promise<SubprocessResult> {
  return startSubprocess(spec).exited;
}

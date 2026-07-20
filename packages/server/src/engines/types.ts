import type {
  EngineId,
  EngineModelList,
  EnginePermissionMode,
  EngineStatus,
  LogLevel,
} from "@adhd/core";

/** How the engine authenticates/bills — resolved from server settings per run. */
export interface EngineConnection {
  mode: string;
  apiKey?: string;
}

export interface EngineRunContext {
  runId: string;
  prompt: string;
  /** Working directory the engine operates in (scratch workspace or user dir). */
  cwd: string;
  model?: string;
  permissionMode: EnginePermissionMode;
  connection?: EngineConnection;
  timeoutMs: number;
  /** Aborting the signal must terminate the engine process tree. */
  signal: AbortSignal;
  /** Streams progress into the run's stage log. */
  onLog: (level: LogLevel, message: string) => void;
}

export interface EngineRunResult {
  success: boolean;
  /** Final assistant result text, when the engine produced one. */
  result?: string;
  exitCode: number | null;
  errorMessage?: string;
  costUsd?: number;
  durationMs?: number;
  numTurns?: number;
}

/** Outcome of a one-click CLI action (install, login) triggered from Setup. */
export interface EngineActionResult {
  ok: boolean;
  /** Tail of command output, for the run/status log. */
  output?: string;
  /** Human-readable summary or failure reason. */
  message?: string;
}

export interface EngineAdapter {
  id: EngineId;
  run(ctx: EngineRunContext): Promise<EngineRunResult>;
  /** Reports whether the engine's CLI is installed and usable. */
  detect?(): Promise<EngineStatus>;
  /**
   * Model roster for the Setup picker, resolved from the CLI or its config
   * rather than our static snapshot. Optional: engines whose CLI can't report
   * one fall back to `modelOptionsFor()`. Must not throw — degrade to the
   * static list with a `note` instead.
   */
  listModels?(): Promise<EngineModelList>;
  /** Installs the engine's CLI (best-effort, platform-specific). */
  install?(): Promise<EngineActionResult>;
  /** Authenticates the CLI — opens the provider's login flow, blocks until done. */
  login?(): Promise<EngineActionResult>;
}

import type { EngineId, EnginePermissionMode, LogLevel } from "@adhd/core";

export interface EngineRunContext {
  runId: string;
  prompt: string;
  /** Working directory the engine operates in (scratch workspace or user dir). */
  cwd: string;
  model?: string;
  permissionMode: EnginePermissionMode;
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

export interface EngineAdapter {
  id: EngineId;
  run(ctx: EngineRunContext): Promise<EngineRunResult>;
}

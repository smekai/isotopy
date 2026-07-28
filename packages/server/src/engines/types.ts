import type {
  EngineId,
  EngineModelList,
  EnginePermissionMode,
  EngineStatus,
  LogLevel,
  StageUsage,
} from "@adhd/core";

export interface EngineConnection {
  mode: string;
  apiKey?: string;
}

export interface EngineRunContext {
  runId: string;
  prompt: string;
  cwd: string;
  model?: string | undefined;
  appendSystemPrompt?: string | undefined;
  permissionMode: EnginePermissionMode;
  connection?: EngineConnection | undefined;
  /** Continue this CLI session instead of starting a new one. */
  resumeSessionId?: string | undefined;
  timeoutMs: number;
  signal: AbortSignal;
  onLog: (level: LogLevel, message: string) => void;
}

export interface EngineRunResult {
  success: boolean;
  result?: string | undefined;
  /** Feed back as `resumeSessionId` to continue this conversation. */
  sessionId?: string | undefined;
  exitCode: number | null;
  errorMessage?: string | undefined;
  usage?: StageUsage | undefined;
}

export interface EngineActionResult {
  ok: boolean;
  output?: string | undefined;
  message?: string | undefined;
}

export interface EngineAdapter {
  id: EngineId;
  run(ctx: EngineRunContext): Promise<EngineRunResult>;
  detect?(): Promise<EngineStatus>;
  listModels?(): Promise<EngineModelList>;
  install?(): Promise<EngineActionResult>;
  login?(): Promise<EngineActionResult>;
}

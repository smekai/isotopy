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
  model: string | undefined;
  appendSystemPrompt: string | undefined;
  permissionMode: EnginePermissionMode;
  connection: EngineConnection;
  /** Continue this CLI session instead of starting a new one. */
  resumeSessionId: string | undefined;
  timeoutMs: number;
  signal: AbortSignal;
  onLog: (level: LogLevel, message: string) => void;
}

export interface EngineRunResult {
  success: boolean;
  result?: string;
  /** Feed back as `resumeSessionId` to continue this conversation. */
  sessionId?: string;
  exitCode: number | null;
  errorMessage?: string;
  usage?: StageUsage;
}

export interface EngineActionResult {
  ok: boolean;
  output?: string;
  message?: string;
}

export interface EngineAdapter {
  id: EngineId;
  run(ctx: EngineRunContext): Promise<EngineRunResult>;
  detect?(): Promise<EngineStatus>;
  listModels?(): Promise<EngineModelList>;
  install?(): Promise<EngineActionResult>;
  login?(): Promise<EngineActionResult>;
}

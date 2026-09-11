import type {
  EffortLevel,
  EngineId,
  EngineLimit,
  EnginePermissionMode,
  EngineStatus,
  ModelOptionDraft,
  StageLogDraft,
  StageUsage,
} from "@isotopy/core";
import type { ToolId } from "../domain/rules/tool-catalog.ts";

export interface EngineConnection {
  mode: string;
  apiKey?: string;
}

export interface McpToolRequest {
  tools: readonly ToolId[];
  runDir: string;
  projectDir: string;
  workspaceRoot: string;
}

export interface EngineRunContext {
  runId: string;
  prompt: string;
  cwd: string;
  model?: string;
  effort?: EffortLevel;
  appendSystemPrompt?: string;
  permissionMode: EnginePermissionMode;
  connection: EngineConnection;
  /** Continue this CLI session instead of starting a new one. */
  resumeSessionId?: string;
  toolCacheDir: string;
  mcpTools: McpToolRequest;
  timeoutMs: number;
  signal: AbortSignal;
  onLog: (log: StageLogDraft) => void;
}

export interface EngineRunResult {
  success: boolean;
  result?: string;
  /** Feed back as `resumeSessionId` to continue this conversation. */
  sessionId?: string;
  exitCode: number | null;
  errorMessage?: string;
  limit?: EngineLimit;
  usage?: StageUsage;
}

export interface LiveModelLayer {
  options: ModelOptionDraft[];
  note?: string;
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
  liveModels(): Promise<LiveModelLayer>;
  configuredModel(): ModelOptionDraft | undefined;
  install?(): Promise<EngineActionResult>;
  login?(): Promise<EngineActionResult>;
}

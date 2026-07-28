import type {
  EngineId,
  EnginePermissionMode,
  LogLevel,
  PipelineDefinition,
  RunState,
  StageDefinition,
  StageUsage,
  StageVerdict,
} from "@adhd/core";
import type { ProjectRegistry } from "../services/project-registry.ts";
import type { SettingsStore } from "../services/settings-store.ts";

export interface PipelineWorkflowInput {
  runId: string;
  projectId: string;
  pipeline: PipelineDefinition;
  task?: string;
  engine?: EngineId;
  model?: string;
  permissionMode: EnginePermissionMode;
  workspacePath?: string;
  seededOutputs?: Record<string, string>;
  startStageId?: string;
  startedMessage: string;
}

export type StageOutcome = "passed" | "failed" | "skipped" | "cancelled" | "asking";

export interface StageResult {
  outcome: StageOutcome;
  output?: string;
  verdict?: StageVerdict;
  question?: string;
  sessionId?: string;
  startedAt: string;
  completedAt: string;
}

export interface StageTurn {
  /** 0 is the stage's opening turn; later turns resume the CLI session. */
  index: number;
  resumeSessionId?: string;
  answer?: string;
}

export interface RunProjection {
  getRun(runId: string): RunState | undefined;
  bindOpenWorkflowRun(runId: string, openWorkflowRunId: string): void;
  runStarted(runId: string, message: string): void;
  stageStarted(runId: string, stageId: string): void;
  log(runId: string, stageId: string, level: LogLevel, message: string): void;
  stageAwaiting(runId: string, stageId: string): void;
  stageAsking(runId: string, stageId: string, question: string): void;
  stageAnswered(runId: string, stageId: string): void;
  gateApproved(runId: string, stageId: string): void;
  stagePassed(runId: string, stageId: string): void;
  stageSkipped(runId: string, stageId: string): void;
  stageFailed(runId: string, stageId: string, message: string): void;
  setVerdict(runId: string, stageId: string, verdict: StageVerdict): void;
  stageUsage(runId: string, stageId: string, usage: StageUsage): void;
  captureStageOutput(runId: string, stageDef: StageDefinition, output: string): void;
  applySeededOutput(runId: string, stageDef: StageDefinition, output: string): void;
  runCompleted(runId: string, status: "completed" | "failed"): void;
}

export interface WorkflowDeps {
  projection: RunProjection;
  registry: ProjectRegistry;
  settings: SettingsStore;
  beginEngineStage(runId: string): AbortController;
  endEngineStage(runId: string): void;
  isCancelled(runId: string): boolean;
}

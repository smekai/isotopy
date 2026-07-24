import type {
  EngineId,
  EnginePermissionMode,
  LogLevel,
  PipelineDefinition,
  RunState,
  StageDefinition,
  StageVerdict,
} from "@adhd/core";
import type { ProjectRegistry } from "../services/project-registry.ts";
import type { SettingsStore } from "../services/settings-store.ts";

export interface SimulationOptions {
  minDurationMs: number;
  maxDurationMs: number;
  failProbability: number;
}

export interface PipelineWorkflowInput {
  runId: string;
  projectId: string;
  pipeline: PipelineDefinition;
  task?: string;
  disabledStages?: string[];
  engine?: EngineId;
  model?: string;
  permissionMode: EnginePermissionMode;
  workspacePath?: string;
  simOptions: SimulationOptions;
  seededOutputs?: Record<string, string>;
  startStageId?: string;
  startedMessage: string;
}

export type StageOutcome = "passed" | "failed" | "cancelled";

export interface StageResult {
  outcome: StageOutcome;
  output?: string;
  verdict?: StageVerdict;
  startedAt: string;
  completedAt: string;
}

export interface RunProjection {
  getRun(runId: string): RunState | undefined;
  bindOwRun(runId: string, owRunId: string): void;
  runStarted(runId: string, message: string): void;
  stageStarted(runId: string, stageId: string): void;
  log(runId: string, stageId: string, level: LogLevel, message: string): void;
  stageAwaiting(runId: string, stageId: string): void;
  gateApproved(runId: string, stageId: string): void;
  stagePassed(runId: string, stageId: string): void;
  stageFailed(runId: string, stageId: string, message: string): void;
  setVerdict(runId: string, stageId: string, verdict: StageVerdict): void;
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

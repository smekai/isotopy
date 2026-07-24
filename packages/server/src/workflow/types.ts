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

/**
 * Timing/failure knobs for the simulated (skill-less) stages. Frozen into the
 * workflow input at start so a resume replays with the same values.
 */
export interface SimulationOptions {
  minDurationMs: number;
  maxDurationMs: number;
  failProbability: number;
}

/**
 * The immutable, JSON-serialisable snapshot handed to a durable run at start.
 * OpenWorkflow persists it as the workflow-run input, so a resume in a fresh
 * process replays against exactly this — the S4 "frozen at start" guarantee.
 */
export interface PipelineWorkflowInput {
  /** ADHD's logical run id — stable across restarts, the projection key. */
  runId: string;
  projectId: string;
  /** Frozen definition snapshot (S4). Walked by the workflow body. */
  pipeline: PipelineDefinition;
  task?: string;
  disabledStages?: string[];
  engine?: EngineId;
  model?: string;
  permissionMode: EnginePermissionMode;
  workspacePath?: string;
  simOptions: SimulationOptions;
  /** G1 restart: retained outputs of stages before `startStageId`. */
  seededOutputs?: Record<string, string>;
  /** G1 restart: first stage to actually re-execute; earlier stages are seeded. */
  startStageId?: string;
  /** Message for the run.started event (fresh start vs. "Restarted from …"). */
  startedMessage: string;
}

/** The outcome of one durable stage step. Memoised by OpenWorkflow. */
export type StageOutcome = "passed" | "failed" | "cancelled";

export interface StageResult {
  outcome: StageOutcome;
  output?: string;
  verdict?: StageVerdict;
  startedAt: string;
  completedAt: string;
}

/**
 * The read-model write surface the durable workflow drives. `RunOrchestrator`
 * implements it. This is the single writer of `RunState`/events — the API layer
 * only reads it (cancellation is the one terminal exception).
 */
export interface RunProjection {
  getRun(runId: string): RunState | undefined;
  /** Record the OpenWorkflow run id backing this logical run. */
  bindOwRun(runId: string, owRunId: string): void;
  runStarted(runId: string, message: string): void;
  stageStarted(runId: string, stageId: string): void;
  log(runId: string, stageId: string, level: LogLevel, message: string): void;
  stageAwaiting(runId: string, stageId: string): void;
  gateApproved(runId: string, stageId: string): void;
  stagePassed(runId: string, stageId: string): void;
  stageFailed(runId: string, stageId: string, message: string): void;
  stageSkipped(runId: string, stageId: string): void;
  setVerdict(runId: string, stageId: string, verdict: StageVerdict): void;
  captureStageOutput(runId: string, stageDef: StageDefinition, output: string): void;
  applySeededOutput(runId: string, stageDef: StageDefinition, output: string): void;
  runCompleted(runId: string, status: "completed" | "failed"): void;
}

/** Everything the durable stage steps need, injected at definition time. */
export interface WorkflowDeps {
  projection: RunProjection;
  registry: ProjectRegistry;
  settings: SettingsStore;
  /** Register the AbortController for the running engine stage of a run (G4). */
  beginEngineStage(runId: string): AbortController;
  /** Clear the AbortController once the engine stage settles. */
  endEngineStage(runId: string): void;
  /** True once `abortRun` has been called for this run (cooperative cancel). */
  isCancelled(runId: string): boolean;
}

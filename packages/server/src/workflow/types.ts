import type {
  DeploymentResult,
  EngineId,
  EngineLimit,
  EnginePermissionMode,
  LimitChoice,
  OrchestratorBrokerDecision,
  OrchestratorBrokerPhase,
  OrchestratorDecision,
  StageLogDraft,
  PipelineDefinition,
  RunCloseoutRecord,
  RunState,
  StageDefinition,
  StageOutcome,
  StageUsage,
  StageVerdict,
} from "@isotopy/core";
import type { StageExchange } from "../domain/markdown/stage.ts";
import type { RunCompletionStatus } from "../domain/rules/run-lifecycle.ts";
import type { StageOutputRejection } from "../domain/rules/stage-context.ts";
import type { SeededStage, SeededStart } from "../domain/rules/run-seeding.ts";
import type { AutomationConfigStore } from "../services/automation-config-store.ts";
import type { DeploymentRunner } from "../services/deployment-runner.ts";
import type { ModelRosterService } from "../services/model-roster-service.ts";
import type { OrchestrationService } from "../services/orchestration-service.ts";
import type { ProductProcessService } from "../services/product-process-service.ts";
import type { ProjectRegistry } from "../services/project-registry.ts";
import type { SettingsStore } from "../services/settings-store.ts";

export type { RunCompletionStatus };

export interface PipelineWorkflowInput {
  runId: string;
  projectId: string;
  pipeline: PipelineDefinition;
  task?: string;
  engine?: EngineId;
  model?: string;
  permissionMode: EnginePermissionMode;
  workspacePath?: string;
  seeded?: SeededStart;
  startedMessage: string;
}

export type { StageOutcome } from "@isotopy/core";

export interface StageResult {
  outcome: StageOutcome;
  output?: string;
  verdict?: StageVerdict;
  question?: string;
  limit?: EngineLimit;
  sessionId?: string;
  startedAt: string;
  completedAt: string;
}

export interface QuestionMediationResult {
  outcome: StageOutcome;
  decision?: OrchestratorBrokerDecision;
  failureMessage?: string;
  limit?: EngineLimit;
  sessionId?: string;
}

export interface StageTurn {
  /** 0 is the stage's opening turn; a later turn resumes the session, or replays `exchanges`. */
  index: number;
  resumeSessionId?: string;
  answer?: string;
  exchanges?: StageExchange[];
}

export interface RunProjection {
  getRun(runId: string): RunState | undefined;
  runStarted(runId: string, message: string): void;
  stageStarted(runId: string, stageId: string): void;
  log(runId: string, stageId: string, draft: StageLogDraft): void;
  stageAwaiting(runId: string, stageId: string): void;
  stageAsking(runId: string, stageId: string, question: string): void;
  stageQuestion(runId: string, stageId: string, question: string): void;
  stageMediatedAnswer(runId: string, stageId: string, answer: string): void;
  stageAnswered(runId: string, stageId: string): void;
  stageBlocked(runId: string, stageId: string, limit: EngineLimit, attempt: number): void;
  limitResolved(runId: string, stageId: string, choice?: LimitChoice): void;
  gateApproved(runId: string, stageId: string): void;
  stagePassed(runId: string, stageId: string): void;
  stageSkipped(runId: string, stageId: string): void;
  stageFailed(runId: string, stageId: string, message: string): void;
  setVerdict(runId: string, stageId: string, verdict: StageVerdict): void;
  stageUsage(runId: string, stageId: string, usage: StageUsage): void;
  captureStageOutput(
    runId: string,
    stageDef: StageDefinition,
    output: string,
  ): Promise<StageOutputRejection | undefined>;
  applySeededStage(runId: string, stageDef: StageDefinition, seeded: SeededStage): void;
  captureDeployment(
    runId: string,
    stageDef: StageDefinition,
    result: DeploymentResult,
    logLines: string[],
  ): Promise<void>;
  captureRunCloseout(runId: string, record: RunCloseoutRecord): Promise<void>;
  runCompleted(runId: string, status: RunCompletionStatus): Promise<void>;
}

export interface QuestionMediationRequest {
  runId: string;
  stageId: string;
  stageTurn: number;
  phase: OrchestratorBrokerPhase;
  question: string;
  userAnswer?: string;
}

export interface QuestionMediationContext {
  orchestrationId: string;
  prompt: string;
}

export interface RunReviewRequest {
  runId: string;
  status: RunState["status"];
}

export interface RunReviewContext {
  orchestrationId: string;
  prompt: string;
}

export interface RunReview {
  artifacts?: RunCloseoutRecord;
  decision?: OrchestratorDecision;
  errors: string[];
}

export interface WorkflowDeps {
  projection: RunProjection;
  registry: ProjectRegistry;
  settings: SettingsStore;
  rosters: ModelRosterService;
  automation: AutomationConfigStore;
  deployment: DeploymentRunner;
  orchestration(): OrchestrationService | undefined;
  product?: ProductProcessService;
  beginEngineStage(runId: string): AbortController;
  endEngineStage(runId: string): void;
  isCancelled(runId: string): boolean;
}

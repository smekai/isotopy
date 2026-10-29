import { task } from "@aikirun/workflow";
import type { Task } from "@aikirun/workflow";
import type { StageDefinition, StageOutcome } from "@isotopy/core";
import type { CiState } from "../domain/rules/pull-request-release.ts";
import type { WaitCheckResult } from "../domain/rules/stage-wait.ts";
import { openPullRequestWork, readChecksWork, settleReleaseWork } from "./release-stage.ts";
import type { ChecksWork, ReleaseOpened, ReleaseWork, SettleWork } from "./release-stage.ts";
import {
  runOrchestratorReviewWork,
  runQuestionMediationWork,
  runStageWork,
} from "./stage-execution.ts";
import { runWaitCheckWork } from "./wait-check.ts";
import type { WaitCheckWork } from "./wait-check.ts";
import type {
  QuestionMediationRequest,
  QuestionMediationResult,
  RunCompletionStatus,
  StageResult,
  StageTurn,
  StageWorkContext,
  WorkflowDeps,
} from "./types.ts";

export interface StageTurnWork {
  context: StageWorkContext;
  stageDef: StageDefinition;
  turn: StageTurn;
}

export interface MediationWork {
  context: StageWorkContext;
  stageDef: StageDefinition;
  request: QuestionMediationRequest;
  resumeSessionId?: string;
}

export interface ReviewWork {
  context: StageWorkContext;
  status: RunCompletionStatus;
}

export interface PipelineTasks {
  stageTurn: Task<StageTurnWork, StageResult>;
  mediation: Task<MediationWork, QuestionMediationResult>;
  review: Task<ReviewWork, null>;
  waitCheck: Task<WaitCheckWork, WaitCheckResult>;
  releaseOpen: Task<ReleaseWork, ReleaseOpened>;
  releaseChecks: Task<ChecksWork, CiState>;
  releaseSettle: Task<SettleWork, StageOutcome>;
}

export function createPipelineTasks(deps: WorkflowDeps): PipelineTasks {
  return {
    stageTurn: task<StageTurnWork, StageResult>({
      name: "isotopy.stage-turn",
      handler: ({ context, stageDef, turn }) => runStageWork(deps, context, stageDef, turn),
    }),
    mediation: task<MediationWork, QuestionMediationResult>({
      name: "isotopy.question-mediation",
      handler: ({ context, stageDef, request, resumeSessionId }) =>
        runQuestionMediationWork(deps, context, stageDef, request, resumeSessionId),
    }),
    review: task<ReviewWork, null>({
      name: "isotopy.orchestrator-review",
      handler: ({ context, status }) => runOrchestratorReviewWork(deps, context, status),
    }),
    waitCheck: task<WaitCheckWork, WaitCheckResult>({
      name: "isotopy.stage-wait-check",
      handler: (work) => runWaitCheckWork(deps, work),
    }),
    releaseOpen: task<ReleaseWork, ReleaseOpened>({
      name: "isotopy.release-open",
      handler: (work) => openPullRequestWork(deps, work),
    }),
    releaseChecks: task<ChecksWork, CiState>({
      name: "isotopy.release-checks",
      handler: (work) => readChecksWork(deps, work),
    }),
    releaseSettle: task<SettleWork, StageOutcome>({
      name: "isotopy.release-settle",
      handler: (work) => settleReleaseWork(deps, work),
    }),
  };
}

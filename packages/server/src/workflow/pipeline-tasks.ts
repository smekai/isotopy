import { task } from "@aikirun/workflow";
import type { Task } from "@aikirun/workflow";
import type { StageDefinition } from "@isotopy/core";
import {
  runOrchestratorReviewWork,
  runQuestionMediationWork,
  runStageWork,
} from "./stage-execution.ts";
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
  };
}

import { task } from "@aikirun/workflow";
import type { Task } from "@aikirun/workflow";
import type { EngineLimit, LimitChoice, StageDefinition, StageLogDraft } from "@isotopy/core";
import type { SeededStage } from "../domain/rules/run-seeding.ts";
import {
  runOrchestratorReviewWork,
  runQuestionMediationWork,
  runStageWork,
} from "./stage-execution.ts";
import type {
  QuestionMediationRequest,
  QuestionMediationResult,
  RunCompletionStatus,
  RunProjection,
  StageResult,
  StageTurn,
  StageWorkContext,
  WorkflowDeps,
} from "./types.ts";

interface StageRef {
  runId: string;
  stageId: string;
}

export type ProjectionCall =
  | { kind: "runStarted"; runId: string; message: string }
  | ({ kind: "stageAwaiting" } & StageRef)
  | ({ kind: "stageAsking"; question: string } & StageRef)
  | ({ kind: "stageQuestion"; question: string } & StageRef)
  | ({ kind: "stageMediatedAnswer"; answer: string } & StageRef)
  | ({ kind: "stageBlocked"; limit: EngineLimit; attempt: number } & StageRef)
  | ({ kind: "limitResolved"; choice?: LimitChoice } & StageRef)
  | ({ kind: "stageFailed"; message: string } & StageRef)
  | ({ kind: "log"; draft: StageLogDraft } & StageRef)
  | ({ kind: "stageSkipped" } & StageRef)
  | { kind: "applySeededStage"; runId: string; stageDef: StageDefinition; seeded: SeededStage }
  | { kind: "runCompleted"; runId: string; status: RunCompletionStatus };

async function applyProjection(projection: RunProjection, call: ProjectionCall): Promise<void> {
  switch (call.kind) {
    case "runStarted":
      return projection.runStarted(call.runId, call.message);
    case "stageAwaiting":
      return projection.stageAwaiting(call.runId, call.stageId);
    case "stageAsking":
      return projection.stageAsking(call.runId, call.stageId, call.question);
    case "stageQuestion":
      return projection.stageQuestion(call.runId, call.stageId, call.question);
    case "stageMediatedAnswer":
      return projection.stageMediatedAnswer(call.runId, call.stageId, call.answer);
    case "stageBlocked":
      return projection.stageBlocked(call.runId, call.stageId, call.limit, call.attempt);
    case "limitResolved":
      return projection.limitResolved(call.runId, call.stageId, call.choice);
    case "stageFailed":
      return projection.stageFailed(call.runId, call.stageId, call.message);
    case "log":
      return projection.log(call.runId, call.stageId, call.draft);
    case "stageSkipped":
      return projection.stageSkipped(call.runId, call.stageId);
    case "applySeededStage":
      return projection.applySeededStage(call.runId, call.stageDef, call.seeded);
    case "runCompleted":
      return projection.runCompleted(call.runId, call.status);
    default:
      return call satisfies never;
  }
}

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
  project: Task<ProjectionCall, null>;
  stageTurn: Task<StageTurnWork, StageResult>;
  mediation: Task<MediationWork, QuestionMediationResult>;
  review: Task<ReviewWork, null>;
}

export function createPipelineTasks(deps: WorkflowDeps): PipelineTasks {
  return {
    project: task<ProjectionCall, null>({
      name: "isotopy.project",
      async handler(call) {
        await applyProjection(deps.projection, call);
        return null;
      },
    }),
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

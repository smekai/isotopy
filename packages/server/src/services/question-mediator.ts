import type {
  OrchestratorBrokerDecision,
  OrchestratorBrokerPhase,
} from "@adhd/core";
import type { ProjectPath } from "../paths.ts";

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

export interface QuestionMediator {
  ensureActive(projectPath: ProjectPath, goal: string): Promise<string>;
  attachRun(projectId: string, runId: string): Promise<void>;
  reconcileRuns(): void;
  contextFor(request: QuestionMediationRequest): Promise<QuestionMediationContext>;
  recordDecision(
    request: QuestionMediationRequest,
    context: QuestionMediationContext,
    decision: OrchestratorBrokerDecision,
  ): Promise<void>;
}

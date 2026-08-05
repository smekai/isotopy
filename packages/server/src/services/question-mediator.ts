import type {
  OrchestratorBrokerDecision,
  OrchestratorBrokerPhase,
} from "@adhd/core";

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
  activeId(projectId: string): string | undefined;
  attachRun(projectId: string, runId: string): Promise<void>;
  reconcileRuns(): void;
  contextFor(request: QuestionMediationRequest): Promise<QuestionMediationContext>;
  recordDecision(
    request: QuestionMediationRequest,
    context: QuestionMediationContext,
    decision: OrchestratorBrokerDecision,
  ): Promise<void>;
}

export class OrchestratorRequiredError extends Error {}

export class ActiveOrchestratorConflictError extends Error {}

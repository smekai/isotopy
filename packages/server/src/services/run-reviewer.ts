import type { OrchestratorDecision, RunArtifactRecord, RunState } from "@adhd/core";

export interface RunReviewRequest {
  runId: string;
  status: RunState["status"];
}

export interface RunReviewContext {
  orchestrationId: string;
  prompt: string;
}

export interface RunReview {
  artifacts?: RunArtifactRecord;
  decision?: OrchestratorDecision;
  errors: string[];
}

export interface RunReviewer {
  reviewContextFor(request: RunReviewRequest): Promise<RunReviewContext>;
  recordReview(
    request: RunReviewRequest,
    context: RunReviewContext,
    review: RunReview,
  ): Promise<void>;
  settle(runId: string): Promise<void>;
}

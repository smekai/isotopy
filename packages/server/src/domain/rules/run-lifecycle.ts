import { STAGE_OUTCOMES } from "@adhd/core";
import type { StageOutcome, StageState } from "@adhd/core";

export type RunCompletionStatus = "completed" | "needs_attention" | "failed";

export const TERMINAL_OPENWORKFLOW_STATUSES = new Set([
  "succeeded",
  "completed",
  "failed",
  "canceled",
]);

export function outcomeForRestart(stage: StageState): StageOutcome {
  if (stage.status === "failed") {
    return stage.verdict === "FAIL"
      ? STAGE_OUTCOMES.NEEDS_ATTENTION
      : STAGE_OUTCOMES.FAILED;
  }
  if (stage.status === "skipped") {
    return STAGE_OUTCOMES.SKIPPED;
  }
  return STAGE_OUTCOMES.PASSED;
}

export function completionMessage(status: RunCompletionStatus): string {
  if (status === "completed") {
    return "Run completed successfully";
  }
  if (status === "needs_attention") {
    return "Run needs attention";
  }
  return "Run failed";
}

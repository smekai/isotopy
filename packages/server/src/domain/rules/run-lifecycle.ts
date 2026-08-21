import { STAGE_OUTCOMES } from "@isotopy/core";
import type { RunState, StageOutcome, StageState, StageStatus } from "@isotopy/core";

export type RunCompletionStatus = "completed" | "needs_attention" | "failed";

const CANCELLABLE_STAGE_STATUSES: StageStatus[] = [
  "pending",
  "running",
  "awaiting",
  "asking",
  "blocked",
];

const INTERRUPTIBLE_STAGE_STATUSES: StageStatus[] = [
  "running",
  "awaiting",
  "asking",
  "blocked",
];

export function applyCancellation(run: RunState, ts: string): string[] {
  const cancelled = run.stages.filter((stage) =>
    CANCELLABLE_STAGE_STATUSES.includes(stage.status),
  );
  for (const stage of cancelled) {
    stage.status = "skipped";
  }
  delete run.limit;
  run.status = "cancelled";
  run.completedAt = ts;
  return cancelled.map((stage) => stage.id);
}

export function applyInterruption(run: RunState, ts: string): string[] {
  const interrupted = run.stages.filter((stage) =>
    INTERRUPTIBLE_STAGE_STATUSES.includes(stage.status),
  );
  for (const stage of interrupted) {
    stage.status = "failed";
    stage.completedAt = ts;
  }
  delete run.limit;
  run.status = "failed";
  run.completedAt = ts;
  return interrupted.map((stage) => stage.id);
}

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

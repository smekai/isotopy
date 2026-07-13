import type { RunState } from "@adhd/core";

// The stage a failed/cancelled run should restart from: the failed stage,
// or (after an abort) the first stage that was skipped by the abort rather
// than by pipeline configuration.
export function restartStageId(run: RunState): string | null {
  const failed = run.stages.find((stage) => stage.status === "failed");
  if (failed) {
    return failed.id;
  }
  const disabled = new Set(run.disabledStages ?? []);
  const skipped = run.stages.find(
    (stage) => stage.status === "skipped" && !disabled.has(stage.id),
  );
  return skipped?.id ?? null;
}

import type { RunState } from "@adhd/core";

/**
 * Whether a run's workspace was the per-run scratch directory the server
 * creates (`.adhd/runs/<id>/workspace`) rather than a directory the user chose.
 *
 * Reusing a scratch path for a *new* run would write into the previous run's
 * folder, so callers offering "run this again" must leave the directory blank
 * instead. Separator-agnostic: the path is absolute and platform-shaped.
 */
export function isScratchWorkspace(workspacePath: string | undefined): boolean {
  if (!workspacePath) {
    return false;
  }
  const normalized = workspacePath.replace(/\\/g, "/");
  return normalized.includes("/.adhd/runs/");
}

/**
 * The stage a failed/cancelled run should *resume* from: the failed stage, or
 * (after an abort) the first stage that was skipped by the abort rather than by
 * pipeline configuration. Work already done by earlier stages is kept.
 */
export function resumeStageId(run: RunState): string | null {
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

/**
 * The stage a full restart begins at: the first stage this run actually runs.
 * Stages disabled for the run stay disabled — that was its configuration, not a
 * failure — so a run with its first box disabled still starts at the next one.
 */
export function firstEnabledStageId(run: RunState): string | null {
  const disabled = new Set(run.disabledStages ?? []);
  return run.stages.find((stage) => !disabled.has(stage.id))?.id ?? null;
}

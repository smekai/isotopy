import type { RunState } from "@adhd/core";

export function isScratchWorkspace(workspacePath: string | undefined): boolean {
  if (!workspacePath) {
    return false;
  }
  const normalized = workspacePath.replace(/\\/g, "/");
  return normalized.includes("/.adhd/runs/");
}

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

export function firstEnabledStageId(run: RunState): string | null {
  const disabled = new Set(run.disabledStages ?? []);
  return run.stages.find((stage) => !disabled.has(stage.id))?.id ?? null;
}

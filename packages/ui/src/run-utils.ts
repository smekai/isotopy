import type { RunState } from "@adhd/core";

const SCRATCH_WORKSPACE = /\/runs\/[^/]+\/workspace$/;

export function isScratchWorkspace(workspacePath: string | undefined): boolean {
  return (
    workspacePath !== undefined && SCRATCH_WORKSPACE.test(workspacePath.replace(/\\/g, "/"))
  );
}

export function childPath(base: string, child: string): string {
  return base.includes("\\")
    ? `${base}\\${child.replace(/\//g, "\\")}`
    : `${base}/${child}`;
}

export function resumeStageId(run: RunState): string | null {
  const failed = run.stages.find((stage) => stage.status === "failed");
  if (failed) {
    return failed.id;
  }
  const skipped = run.stages.find((stage) => stage.status === "skipped");
  return skipped?.id ?? null;
}

export function firstStageId(run: RunState): string | null {
  return run.stages[0]?.id ?? null;
}

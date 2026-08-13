import { STAGE_VERDICTS } from "@isotopy/core";
import type { StageState, StageStatus } from "@isotopy/core";

export interface StageProgress {
  id: string;
  status: StageStatus;
}

export type StagePresentation = StageStatus | "needs_attention";

export function stagePresentation(
  stage: Pick<StageState, "status" | "verdict">,
): StagePresentation {
  return stage.status === "failed" && stage.verdict === STAGE_VERDICTS.FAIL
    ? "needs_attention"
    : stage.status;
}

export interface RunProgress {
  stages: readonly StageProgress[];
}

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

export function resumeStageId(run: RunProgress): string | null {
  const failed = run.stages.find((stage) => stage.status === "failed");
  if (failed) {
    return failed.id;
  }
  const skipped = run.stages.find((stage) => stage.status === "skipped");
  return skipped?.id ?? null;
}

export function firstStageId(run: RunProgress): string | null {
  return run.stages[0]?.id ?? null;
}

import type { RunState } from "@isotopy/core";
import type { ProjectPath } from "../../paths.ts";
import type { ProjectRegistry } from "../project-registry.ts";
import { taskBoardFor } from "../task-board-adapter.ts";

export async function claimSourceTasks(
  projectPath: ProjectPath,
  sourceTaskIds: string[],
  runId: string,
): Promise<void> {
  if (sourceTaskIds.length === 0) {
    return;
  }
  await taskBoardFor(projectPath).transitionTasks(sourceTaskIds, "In Progress", runId);
}

export async function releaseUnfinishedSourceTasks(
  registry: ProjectRegistry,
  run: RunState,
): Promise<void> {
  if (!shouldReleaseSourceTasks(run)) {
    return;
  }
  try {
    await taskBoardFor(registry.resolve(run.projectId)).transitionTasks(
      run.sourceTaskIds!,
      "Next",
      run.id,
      { onlyFrom: "In Progress" },
    );
  } catch (error: unknown) {
    console.warn(`Failed to release source tasks for run ${run.id}:`, error);
  }
}

export function shouldReleaseSourceTasks(run: RunState): boolean {
  if (!run.sourceTaskIds?.length) {
    return false;
  }
  if (run.status === "completed") {
    return false;
  }
  if (run.closeout) {
    return false;
  }
  return true;
}

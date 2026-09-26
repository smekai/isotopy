import type { RunState } from "@isotopy/core";
import { sourceTasksToRelease } from "../../domain/rules/run-lifecycle.ts";
import type { ProjectPath } from "../../paths.ts";
import type { ProjectRegistry } from "../project-registry.ts";
import { taskBoardFor } from "../task-board-adapter.ts";

export async function claimSourceTasks(projectPath: ProjectPath, run: RunState): Promise<void> {
  await taskBoardFor(projectPath).transitionTasks(run.sourceTaskIds ?? [], "In Progress", run.id);
}

export async function reclaimReleasedSourceTasks(
  projectPath: ProjectPath,
  run: RunState,
): Promise<void> {
  await taskBoardFor(projectPath).transitionTasks(
    run.sourceTaskIds ?? [],
    "In Progress",
    run.id,
    { onlyFrom: "Next" },
  );
}

export async function releaseUnfinishedSourceTasks(
  registry: ProjectRegistry,
  run: RunState,
): Promise<void> {
  try {
    await taskBoardFor(registry.resolve(run.projectId)).transitionTasks(
      sourceTasksToRelease(run),
      "Next",
      run.id,
      { onlyFrom: "In Progress" },
    );
  } catch (error: unknown) {
    console.warn(`Failed to release source tasks for run ${run.id}:`, error);
  }
}

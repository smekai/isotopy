import type { EnginePermissionMode, PipelineDefinition, RunState } from "@isotopy/core";
import type { SeededStart } from "../domain/rules/run-seeding.ts";
import type { PipelineWorkflowInput } from "./types.ts";

export interface PipelineLaunch {
  startedMessage: string;
  task?: string;
  seeded?: SeededStart;
  readmit?: boolean;
}

export function pipelineWorkflowInput(
  run: RunState,
  pipeline: PipelineDefinition,
  permissionMode: EnginePermissionMode,
  launch: PipelineLaunch,
): PipelineWorkflowInput {
  return {
    runId: run.id,
    projectId: run.projectId,
    pipeline,
    task: launch.task ?? run.task,
    engine: run.engine,
    model: run.model,
    permissionMode,
    workspacePath: run.workspacePath,
    startedMessage: launch.startedMessage,
    seeded: launch.seeded,
  };
}

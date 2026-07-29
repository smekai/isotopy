import type { StartRunOptions } from "../services/run-orchestrator.ts";

export interface RunOptionInput {
  task?: string;
  engine?: string;
  model?: string;
  permissionMode?: string;
  milestoneId?: string;
  featureId?: string;
  sourceTaskIds?: string[];
}

export function runOptionsFrom(input: RunOptionInput): StartRunOptions {
  const options: StartRunOptions = {};
  if (input.task !== undefined) options.task = input.task;
  if (input.engine !== undefined) options.engine = input.engine;
  if (input.model !== undefined) options.model = input.model;
  if (input.permissionMode !== undefined) {
    options.permissionMode = input.permissionMode;
  }
  if (input.milestoneId !== undefined) options.milestoneId = input.milestoneId;
  if (input.featureId !== undefined) options.featureId = input.featureId;
  if (input.sourceTaskIds !== undefined) {
    options.sourceTaskIds = input.sourceTaskIds;
  }
  return options;
}

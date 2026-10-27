import { PLAN_FEATURE_STEP_TASK, findPipeline, flattenPipelineStages } from "@isotopy/core";
import type { RunState, StageDefinition } from "@isotopy/core";
import type { UpstreamOutput } from "../markdown/stage.ts";

export function seesHandoffs(run: RunState, stageDef: StageDefinition): boolean {
  return stageDef.context !== "isolated" || run.reviewContextGrant !== undefined;
}

function planStageIds(run: RunState): Set<string> {
  const pipeline = run.pipeline ?? findPipeline(run.pipelineId);
  const stages = pipeline === undefined ? [] : flattenPipelineStages(pipeline);
  return new Set(
    stages.filter((stage) => stage.stepTask === PLAN_FEATURE_STEP_TASK).map((stage) => stage.id),
  );
}

export function upstreamFor(run: RunState, stageDef: StageDefinition): UpstreamOutput[] {
  const index = run.stages.findIndex((stage) => stage.id === stageDef.id);
  if (index <= 0) {
    return [];
  }
  const outputs = run.stageOutputs ?? {};
  const earlier = run.stages.slice(0, index);
  const plans = planStageIds(run);
  const visible = seesHandoffs(run, stageDef)
    ? earlier
    : earlier.filter((stage) => plans.has(stage.id));
  return visible
    .map((stage) => ({ label: stage.label, output: outputs[stage.id] ?? "" }))
    .filter((entry) => entry.output !== "");
}

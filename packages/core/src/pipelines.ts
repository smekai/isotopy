export interface StageDefinition {
  id: string;
  label: string;
  gateAfter?: boolean;
  skill?: string;
}

export interface PipelineGroup {
  stages: StageDefinition[];
}

export interface PipelineDefinition {
  id: string;
  name: string;
  description: string;
  groups: PipelineGroup[];
}

export const ONE_BOX_PIPELINE: PipelineDefinition = {
  id: "one-box",
  name: "Single agent",
  description: "One Developer box: prompt in, result out — runs a real engine.",
  groups: [
    {
      stages: [{ id: "implementation", label: "Implementation", skill: "developer" }],
    },
  ],
};

export const DEV_TEST_PIPELINE: PipelineDefinition = {
  id: "dev-test",
  name: "Developer + Tester",
  description:
    "Two boxes: a Developer implements the task, then a Tester verifies it in the same workspace.",
  groups: [
    {
      stages: [
        { id: "implementation", label: "Developer", skill: "developer" },
        { id: "test", label: "Tester", skill: "tester" },
      ],
    },
  ],
};

export const GATED_DEV_TEST_PIPELINE: PipelineDefinition = {
  id: "gated-dev-test",
  name: "Developer + approval + Tester",
  description:
    "A Developer implements the task; you approve the work at a gate; then a Tester verifies it.",
  groups: [
    {
      stages: [
        { id: "implementation", label: "Developer", skill: "developer", gateAfter: true },
        { id: "test", label: "Tester", skill: "tester" },
      ],
    },
  ],
};

export const DEMO_PIPELINES: PipelineDefinition[] = [
  ONE_BOX_PIPELINE,
  DEV_TEST_PIPELINE,
  GATED_DEV_TEST_PIPELINE,
];

export function flattenPipelineStages(
  pipeline: PipelineDefinition,
): StageDefinition[] {
  return pipeline.groups.flatMap((group) => group.stages);
}

export const DEFAULT_PIPELINE_ID: string = DEV_TEST_PIPELINE.id;

export function pipelineUsesEngine(pipeline: PipelineDefinition): boolean {
  return flattenPipelineStages(pipeline).some((stage) => stage.skill !== undefined);
}

export function findPipeline(pipelineId: string): PipelineDefinition | undefined {
  return DEMO_PIPELINES.find((pipeline) => pipeline.id === pipelineId);
}

export function pipelineUsesEngineById(pipelineId: string): boolean {
  const pipeline = findPipeline(pipelineId);
  return pipeline !== undefined && pipelineUsesEngine(pipeline);
}

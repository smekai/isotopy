export interface StageDefinition {
  id: string;
  label: string;
  gateAfter?: boolean;
  skill?: string;
}

export interface PipelineGroup {
  mode: "sequential" | "parallel";
  stages: StageDefinition[];
}

export interface PipelineDefinition {
  id: string;
  name: string;
  description: string;
  groups: PipelineGroup[];
}

export const LIFECYCLE_STAGES: StageDefinition[] = [
  { id: "intake", label: "Intake" },
  { id: "requirements", label: "Requirements", gateAfter: true },
  { id: "design", label: "Design", gateAfter: true },
  { id: "implementation", label: "Implementation" },
  { id: "review", label: "Review" },
  { id: "test", label: "Test" },
  { id: "release", label: "Release", gateAfter: true },
  { id: "deploy", label: "Deploy" },
];

export const SEQUENTIAL_PIPELINE: PipelineDefinition = {
  id: "sequential",
  name: "Sequential lifecycle",
  description: "Eight stages run one after another — the full ADHD pipeline.",
  groups: [
    {
      mode: "sequential",
      stages: LIFECYCLE_STAGES,
    },
  ],
};

export const ONE_BOX_PIPELINE: PipelineDefinition = {
  id: "one-box",
  name: "Single agent",
  description: "One Developer box: prompt in, result out — runs a real engine.",
  groups: [
    {
      mode: "sequential",
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
      mode: "sequential",
      stages: [
        { id: "implementation", label: "Developer", skill: "developer" },
        { id: "test", label: "Tester", skill: "tester" },
      ],
    },
  ],
};

export const DEMO_PIPELINES: PipelineDefinition[] = [
  SEQUENTIAL_PIPELINE,
  ONE_BOX_PIPELINE,
  DEV_TEST_PIPELINE,
];

export function flattenPipelineStages(
  pipeline: PipelineDefinition,
): StageDefinition[] {
  return pipeline.groups.flatMap((group) => group.stages);
}

export const DEFAULT_PIPELINE_ID: string = SEQUENTIAL_PIPELINE.id;

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

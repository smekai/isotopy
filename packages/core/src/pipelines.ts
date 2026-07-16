export interface StageDefinition {
  id: string;
  label: string;
  gateAfter?: boolean;
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
      stages: [{ id: "implementation", label: "Implementation" }],
    },
  ],
};

export const DEMO_PIPELINES: PipelineDefinition[] = [
  SEQUENTIAL_PIPELINE,
  ONE_BOX_PIPELINE,
];

export function flattenPipelineStages(
  pipeline: PipelineDefinition,
): StageDefinition[] {
  return pipeline.groups.flatMap((group) => group.stages);
}

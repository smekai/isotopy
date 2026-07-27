export interface StageDefinition {
  id: string;
  label: string;
  gateAfter?: boolean;
  /** May stop and ask the user a question mid-stage, on an engine that can resume. */
  interactive?: boolean;
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

export const SOLO_PIPELINE: PipelineDefinition = {
  id: "solo",
  name: "Single agent",
  description:
    "One box that does everything, and may stop to ask you a clarifying question.",
  groups: [
    {
      stages: [{ id: "solo", label: "Agent", skill: "solo", interactive: true }],
    },
  ],
};

export const PM_DEV_TEST_PIPELINE: PipelineDefinition = {
  id: "pm-dev-test",
  name: "Project Manager + Developer + Tester",
  description:
    "A Project Manager works out what to build and recommends an approach; you approve it; " +
    "then a Developer implements it and a Tester verifies the result.",
  groups: [
    {
      stages: [
        {
          id: "intake",
          label: "Project Manager",
          skill: "project-manager",
          interactive: true,
          gateAfter: true,
        },
        { id: "implementation", label: "Developer", skill: "developer" },
        { id: "test", label: "Tester", skill: "tester" },
      ],
    },
  ],
};

export const DEMO_PIPELINES: PipelineDefinition[] = [
  PM_DEV_TEST_PIPELINE,
  SOLO_PIPELINE,
];

/** Presets removed in TASK-080. Runs on disk still name them. */
export const RETIRED_PIPELINE_IDS: string[] = ["one-box", "dev-test", "gated-dev-test"];

export function flattenPipelineStages(
  pipeline: PipelineDefinition,
): StageDefinition[] {
  return pipeline.groups.flatMap((group) => group.stages);
}

export const DEFAULT_PIPELINE_ID: string = PM_DEV_TEST_PIPELINE.id;

export function isRetiredPipeline(pipelineId: string): boolean {
  return RETIRED_PIPELINE_IDS.includes(pipelineId);
}

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

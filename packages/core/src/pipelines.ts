export interface StageDefinition {
  id: string;
  label: string;
  gateAfter?: boolean;
  /**
   * Persona this stage runs as — the id of a markdown skill under
   * `.adhd/skills/<skill>.md`. A stage with a skill is engine-backed: the
   * orchestrator runs a real harness for it and injects the persona.
   * Stages without one are simulated.
   */
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

/**
 * The first real multi-box workflow: a Developer implements, then a Tester
 * verifies. Both boxes run a real engine in the same workspace, so the Tester
 * sees the code the Developer just wrote; the Developer's summary is handed
 * forward as context. No gates — the run flows straight through.
 */
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

/**
 * Whether any stage runs a real harness (i.e. carries a persona). Drives engine
 * validation and workspace setup at run start — keyed off the stage model
 * rather than a hardcoded pipeline id, so new engine-backed pipelines just work.
 */
export function pipelineUsesEngine(pipeline: PipelineDefinition): boolean {
  return flattenPipelineStages(pipeline).some((stage) => stage.skill !== undefined);
}

/** Look up a built-in pipeline by id. */
export function findPipeline(pipelineId: string): PipelineDefinition | undefined {
  return DEMO_PIPELINES.find((pipeline) => pipeline.id === pipelineId);
}

/**
 * Whether the pipeline with this id runs a real harness. Lets callers that only
 * hold an id (the UI) decide whether to send engine/model/workspace settings,
 * without hardcoding which pipelines those are. Unknown ids are not engine-backed.
 */
export function pipelineUsesEngineById(pipelineId: string): boolean {
  const pipeline = findPipeline(pipelineId);
  return pipeline !== undefined && pipelineUsesEngine(pipeline);
}

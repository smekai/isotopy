export type StageStatus = "pending" | "running" | "passed" | "failed";
export type RunStatus = "pending" | "running" | "completed" | "failed";

export interface StageDefinition {
  id: string;
  label: string;
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

export interface StageState {
  id: string;
  label: string;
  status: StageStatus;
  logs: string[];
  startedAt?: string;
  completedAt?: string;
}

export interface RunState {
  id: string;
  pipelineId: string;
  pipelineName: string;
  status: RunStatus;
  stages: StageState[];
  createdAt: string;
  completedAt?: string;
}

export type RunEventType =
  | "run.started"
  | "run.completed"
  | "stage.started"
  | "stage.log"
  | "stage.completed"
  | "stage.failed";

export interface RunEvent {
  ts: string;
  type: RunEventType;
  runId: string;
  stageId?: string;
  message?: string;
  status?: StageStatus | RunStatus;
}

const LIFECYCLE_STAGES: StageDefinition[] = [
  { id: "intake", label: "Intake" },
  { id: "requirements", label: "Requirements" },
  { id: "design", label: "Design" },
  { id: "implementation", label: "Implementation" },
  { id: "review", label: "Review" },
  { id: "test", label: "Test" },
  { id: "release", label: "Release" },
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

export const PARALLEL_PIPELINE: PipelineDefinition = {
  id: "parallel",
  name: "Parallel + sequential mix",
  description:
    "Requirements and design run in parallel, then implementation chain, then release and deploy in parallel.",
  groups: [
    {
      mode: "parallel",
      stages: [
        { id: "requirements", label: "Requirements" },
        { id: "design", label: "Design" },
      ],
    },
    {
      mode: "sequential",
      stages: [
        { id: "implementation", label: "Implementation" },
        { id: "review", label: "Review" },
        { id: "test", label: "Test" },
      ],
    },
    {
      mode: "parallel",
      stages: [
        { id: "release", label: "Release" },
        { id: "deploy", label: "Deploy" },
      ],
    },
  ],
};

export const DEMO_PIPELINES: PipelineDefinition[] = [
  SEQUENTIAL_PIPELINE,
  PARALLEL_PIPELINE,
];

export function flattenPipelineStages(
  pipeline: PipelineDefinition,
): StageDefinition[] {
  return pipeline.groups.flatMap((group) => group.stages);
}

export function createInitialRunState(
  runId: string,
  pipeline: PipelineDefinition,
): RunState {
  return {
    id: runId,
    pipelineId: pipeline.id,
    pipelineName: pipeline.name,
    status: "pending",
    createdAt: new Date().toISOString(),
    stages: flattenPipelineStages(pipeline).map((stage) => ({
      id: stage.id,
      label: stage.label,
      status: "pending",
      logs: [],
    })),
  };
}

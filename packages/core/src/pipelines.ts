import { z } from "zod";
import { MODEL_TIERS } from "./engines.ts";
import { requiredText } from "./schema.ts";

export const STAGE_OUTPUT_PROTOCOLS = {
  VERDICT: "verdict",
  DECISION: "decision",
} as const;

export type StageOutputProtocol =
  (typeof STAGE_OUTPUT_PROTOCOLS)[keyof typeof STAGE_OUTPUT_PROTOCOLS];

export const STAGE_EXECUTION_POLICIES = {
  STANDARD: "standard",
  QUALITY: "quality",
  DELIVERY: "delivery",
  CLOSEOUT: "closeout",
} as const;

export type StageExecutionPolicy =
  (typeof STAGE_EXECUTION_POLICIES)[keyof typeof STAGE_EXECUTION_POLICIES];

export const stageDefinitionSchema = z
  .object({
    id: requiredText,
    label: requiredText,
    gateAfter: z.boolean().optional(),
    interactive: z.boolean().optional(),
    skill: requiredText.optional(),
    stepTask: requiredText.optional(),
    modelTier: z.enum(MODEL_TIERS).optional(),
    executionPolicy: z.enum(STAGE_EXECUTION_POLICIES).optional(),
    outputProtocol: z.enum(STAGE_OUTPUT_PROTOCOLS).optional(),
    maxTurns: z.number().int().positive().optional(),
  })
  .strict();

export type StageDefinition = z.infer<typeof stageDefinitionSchema>;

export const pipelineGroupSchema = z
  .object({ stages: z.array(stageDefinitionSchema) })
  .strict();

export type PipelineGroup = z.infer<typeof pipelineGroupSchema>;

export const pipelineDefinitionSchema = z
  .object({
    id: requiredText,
    name: requiredText,
    description: requiredText,
    internal: z.boolean().optional(),
    groups: z.array(pipelineGroupSchema),
  })
  .strict();

export type PipelineDefinition = z.infer<typeof pipelineDefinitionSchema>;

export const SOLO_PIPELINE: PipelineDefinition = {
  id: "solo",
  name: "Single agent",
  description:
    "One box that does everything, and may stop to ask you a clarifying question.",
  groups: [
    {
      stages: [{ id: "solo", label: "Working", skill: "solo", interactive: true }],
    },
  ],
};

export const PM_DEV_TEST_PIPELINE: PipelineDefinition = {
  id: "pm-dev-test",
  name: "Product Manager + Developer + QA",
  description:
    "A Product Manager works out what to build and recommends an approach; you approve it; " +
    "then a Developer implements it and a QA Engineer verifies the result.",
  groups: [
    {
      stages: [
        {
          id: "intake",
          label: "Scoping",
          skill: "project-manager",
          stepTask: "plan-feature",
          interactive: true,
          gateAfter: true,
        },
        {
          id: "implementation",
          label: "Implementing",
          skill: "developer",
          stepTask: "implement-feature",
        },
        {
          id: "test",
          label: "Verifying",
          skill: "tester",
          stepTask: "verify-feature",
        },
      ],
    },
  ],
};

export const FULL_DELIVERY_PIPELINE: PipelineDefinition = {
  id: "full-delivery",
  name: "Full Delivery",
  description:
    "A complete delivery loop with approved scope, design and architecture, implementation, " +
    "independent review, QA, release preparation, preview deployment, and closeout.",
  groups: [
    {
      stages: [
        {
          id: "intake",
          label: "Scoping",
          skill: "project-manager",
          stepTask: "plan-feature",
          interactive: true,
          gateAfter: true,
        },
        {
          id: "product-design",
          label: "Designing the experience",
          skill: "product-designer",
          stepTask: "design-experience",
        },
        {
          id: "architecture",
          label: "Architecting",
          skill: "software-architect",
          stepTask: "design-architecture",
        },
        {
          id: "implementation",
          label: "Implementing",
          skill: "developer",
          stepTask: "implement-feature",
        },
        {
          id: "review",
          label: "Reviewing",
          skill: "software-architect",
          stepTask: "review-implementation",
          executionPolicy: STAGE_EXECUTION_POLICIES.QUALITY,
        },
        {
          id: "test",
          label: "Verifying",
          skill: "tester",
          stepTask: "verify-feature",
          executionPolicy: STAGE_EXECUTION_POLICIES.QUALITY,
        },
        {
          id: "release",
          label: "Preparing the release",
          skill: "release-manager",
          stepTask: "prepare-release",
          executionPolicy: STAGE_EXECUTION_POLICIES.DELIVERY,
        },
        {
          id: "deploy",
          label: "Deploying the preview",
          skill: "sre",
          stepTask: "deploy-preview",
          executionPolicy: STAGE_EXECUTION_POLICIES.DELIVERY,
        },
        {
          id: "closeout",
          label: "Closing out",
          skill: "project-manager",
          stepTask: "closeout-feature",
          executionPolicy: STAGE_EXECUTION_POLICIES.CLOSEOUT,
        },
      ],
    },
  ],
};

export const MILESTONE_PLANNING_PIPELINE: PipelineDefinition = {
  id: "milestone-planning",
  name: "Milestone planning",
  description:
    "A dedicated Product Manager conversation that produces an approved milestone plan.",
  internal: true,
  groups: [
    {
      stages: [
        {
          id: "milestone-plan",
          label: "Planning the milestone",
          skill: "project-manager",
          stepTask: "plan-milestone",
          interactive: true,
        },
      ],
    },
  ],
};

export const ORCHESTRATION_MAX_TURNS = 24;

export const ORCHESTRATION_PIPELINE: PipelineDefinition = {
  id: "orchestration",
  name: "Orchestration",
  description:
    "An Orchestrator conversation that decides what the team is and what runs next.",
  internal: true,
  groups: [
    {
      stages: [
        {
          id: "orchestrate",
          label: "Orchestrating",
          skill: "orchestrator",
          stepTask: "orchestrate",
          modelTier: "deep",
          interactive: true,
          outputProtocol: STAGE_OUTPUT_PROTOCOLS.DECISION,
          maxTurns: ORCHESTRATION_MAX_TURNS,
        },
      ],
    },
  ],
};

export const DEMO_PIPELINES: PipelineDefinition[] = [
  FULL_DELIVERY_PIPELINE,
  PM_DEV_TEST_PIPELINE,
  SOLO_PIPELINE,
  MILESTONE_PLANNING_PIPELINE,
  ORCHESTRATION_PIPELINE,
];

export const RETIRED_PIPELINE_IDS: string[] = ["one-box", "dev-test", "gated-dev-test"];

export function flattenPipelineStages(
  pipeline: PipelineDefinition,
): StageDefinition[] {
  return pipeline.groups.flatMap((group) => group.stages);
}

export function gateKey(pipelineId: string, stageId: string): string {
  return `${pipelineId}:${stageId}`;
}

export function gateEnabled(
  pipelineId: string,
  stage: StageDefinition,
  gates: Record<string, boolean> = {},
): boolean {
  return gates[gateKey(pipelineId, stage.id)] ?? stage.gateAfter ?? false;
}

export function applyGatePreferences(
  pipeline: PipelineDefinition,
  gates: Record<string, boolean> = {},
): PipelineDefinition {
  const stages = flattenPipelineStages(pipeline);
  const unchanged = stages.every(
    (stage) => gateEnabled(pipeline.id, stage) === gateEnabled(pipeline.id, stage, gates),
  );
  if (pipeline.internal === true || unchanged) {
    return pipeline;
  }
  return {
    ...pipeline,
    groups: pipeline.groups.map((group) => ({
      ...group,
      stages: group.stages.map((stage) => ({
        ...stage,
        gateAfter: gateEnabled(pipeline.id, stage, gates),
      })),
    })),
  };
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

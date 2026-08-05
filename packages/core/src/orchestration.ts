import { z } from "zod";
import { STAGE_EXECUTION_POLICIES, pipelineDefinitionSchema } from "./pipelines.ts";
import { requiredText, requiredTexts, timestamp } from "./schema.ts";

export const ORCHESTRATOR_ACTIONS = [
  "propose_team",
  "delegate_milestone_planning",
  "start_run",
  "continue_milestone",
  "ask_user",
  "stop",
  "answer_agent",
  "escalate_to_user",
  "route_to_agent",
] as const;

export type OrchestratorAction = (typeof ORCHESTRATOR_ACTIONS)[number];

export const orchestratorRoleSchema = z
  .object({
    id: requiredText,
    label: requiredText,
    skill: requiredText,
    stepTask: requiredText,
    rationale: requiredText.optional(),
    executionPolicy: z.enum(STAGE_EXECUTION_POLICIES).optional(),
    gateAfter: z.boolean().optional(),
    interactive: z.boolean().optional(),
  })
  .strict();

export type OrchestratorRole = z.infer<typeof orchestratorRoleSchema>;

export const orchestratorTeamProposalSchema = z
  .object({
    name: requiredText,
    summary: requiredText,
    roles: z.array(orchestratorRoleSchema).min(1),
  })
  .strict();

export type OrchestratorTeamProposal = z.infer<typeof orchestratorTeamProposalSchema>;

const answerAgentDecisionSchema = z
  .object({
    action: z.literal("answer_agent"),
    answer: requiredText,
    rationale: requiredText,
  })
  .strict();

const escalateToUserDecisionSchema = z
  .object({
    action: z.literal("escalate_to_user"),
    question: requiredText,
    originStageId: requiredText,
    context: requiredText.optional(),
  })
  .strict();

const routeToAgentDecisionSchema = z
  .object({
    action: z.literal("route_to_agent"),
    stageId: requiredText,
    message: requiredText,
    rationale: requiredText,
  })
  .strict();

export const orchestratorBrokerDecisionSchema = z.discriminatedUnion("action", [
  answerAgentDecisionSchema,
  escalateToUserDecisionSchema,
  routeToAgentDecisionSchema,
]);

export type OrchestratorBrokerDecision = z.infer<
  typeof orchestratorBrokerDecisionSchema
>;

export const orchestratorDecisionSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("propose_team"),
      rationale: requiredText,
      team: orchestratorTeamProposalSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("delegate_milestone_planning"),
      rationale: requiredText,
      goal: requiredText,
    })
    .strict(),
  z
    .object({
      action: z.literal("start_run"),
      rationale: requiredText,
      task: requiredText,
      teamId: requiredText.optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("continue_milestone"),
      rationale: requiredText,
      featureId: requiredText.optional(),
    })
    .strict(),
  z.object({ action: z.literal("ask_user"), question: requiredText }).strict(),
  z
    .object({
      action: z.literal("stop"),
      reason: requiredText,
      summary: requiredText.optional(),
    })
    .strict(),
  answerAgentDecisionSchema,
  escalateToUserDecisionSchema,
  routeToAgentDecisionSchema,
]);

export type OrchestratorDecision = z.infer<typeof orchestratorDecisionSchema>;

export const ORCHESTRATION_STATUSES = [
  "conversing",
  "awaiting_user",
  "awaiting_approval",
  "running",
  "stopped",
] as const;

export type OrchestrationStatus = (typeof ORCHESTRATION_STATUSES)[number];

export const orchestrationTurnSchema = z
  .object({
    runId: requiredText,
    decision: orchestratorDecisionSchema,
    at: timestamp,
  })
  .strict();

export type OrchestrationTurn = z.infer<typeof orchestrationTurnSchema>;

export const ORCHESTRATOR_BROKER_PHASES = ["question", "user_answer"] as const;

export type OrchestratorBrokerPhase =
  (typeof ORCHESTRATOR_BROKER_PHASES)[number];

export const orchestratorBrokerTurnSchema = z
  .object({
    id: requiredText,
    runId: requiredText,
    stageId: requiredText,
    phase: z.enum(ORCHESTRATOR_BROKER_PHASES),
    decision: orchestratorBrokerDecisionSchema,
    at: timestamp,
  })
  .strict();

export type OrchestratorBrokerTurn = z.infer<typeof orchestratorBrokerTurnSchema>;

export const orchestrationSchema = z
  .object({
    id: requiredText,
    projectId: requiredText,
    goal: requiredText,
    status: z.enum(ORCHESTRATION_STATUSES),
    turns: z.array(orchestrationTurnSchema),
    brokerTurns: z.array(orchestratorBrokerTurnSchema).optional(),
    latestDecision: orchestratorDecisionSchema.optional(),
    decisionError: requiredText.optional(),
    approvedTeam: orchestratorTeamProposalSchema.optional(),
    composedPipeline: pipelineDefinitionSchema.optional(),
    runIds: requiredTexts,
    stoppedAt: timestamp.optional(),
    stopReason: requiredText.optional(),
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  .strict();

export type Orchestration = z.infer<typeof orchestrationSchema>;

export function latestOrchestratorDecision(
  orchestration: Orchestration,
): OrchestratorDecision | undefined {
  return orchestration.turns.at(-1)?.decision;
}

export function orchestrationStatusFor(
  decision: OrchestratorDecision,
): OrchestrationStatus {
  switch (decision.action) {
    case "propose_team":
      return "awaiting_approval";
    case "ask_user":
    case "escalate_to_user":
      return "awaiting_user";
    case "stop":
      return "stopped";
    case "delegate_milestone_planning":
    case "start_run":
    case "continue_milestone":
      return "running";
    case "answer_agent":
    case "route_to_agent":
      return "conversing";
    default: {
      const unreachable: never = decision;
      return unreachable;
    }
  }
}

import { STAGE_EXECUTION_POLICIES, flattenPipelineStages } from "@isotopy/core";
import type {
  ModelTier,
  OrchestratorRole,
  OrchestratorTeamProposal,
  PipelineDefinition,
  StageDefinition,
} from "@isotopy/core";
import { PERSONA_CATALOG } from "../skills/catalog.ts";
import type { StepTaskDeclaration } from "../../schemas/step-task.ts";
import type { ValidationIssue, ValidationResult } from "../validation.ts";
import { SKILL_ID } from "./persona-notes.ts";

export type StepTaskVocabulary = ReadonlyMap<string, StepTaskDeclaration>;

const PERSONA_IDS = new Set(PERSONA_CATALOG.map((entry) => entry.id));

export function personaFor(
  role: OrchestratorRole,
  stepTasks: StepTaskVocabulary,
): string | undefined {
  return role.skill ?? stepTasks.get(role.stepTask)?.agent;
}

// The approval card shows what the Orchestrator proposed, so a role that left its
// persona to the step task has to carry the resolved one before the user sees it.
export function withResolvedPersonas(
  team: OrchestratorTeamProposal,
  stepTasks: StepTaskVocabulary,
): OrchestratorTeamProposal {
  return {
    ...team,
    roles: team.roles.map((role) => ({ ...role, skill: personaFor(role, stepTasks) })),
  };
}

function roleIssues(
  role: OrchestratorRole,
  index: number,
  stepTasks: StepTaskVocabulary,
): ValidationIssue[] {
  return [
    ...roleIdIssues(role, index),
    ...stepTaskIssues(role, index, stepTasks),
    ...personaIssues(role, index, stepTasks),
  ];
}

function roleIdIssues(role: OrchestratorRole, index: number): ValidationIssue[] {
  return SKILL_ID.test(role.id)
    ? []
    : [
        {
          path: ["roles", index, "id"],
          message: "Role id must contain only lowercase letters, digits, and hyphens",
        },
      ];
}

function stepTaskIssues(
  role: OrchestratorRole,
  index: number,
  stepTasks: StepTaskVocabulary,
): ValidationIssue[] {
  const declaration = stepTasks.get(role.stepTask);
  if (declaration === undefined) {
    return [
      { path: ["roles", index, "stepTask"], message: `Unknown step task: ${role.stepTask}` },
    ];
  }
  return declaration.internal
    ? [
        {
          path: ["roles", index, "stepTask"],
          message: `${role.stepTask} is Isotopy's own step; a composed team cannot take it`,
        },
      ]
    : [];
}

function personaIssues(
  role: OrchestratorRole,
  index: number,
  stepTasks: StepTaskVocabulary,
): ValidationIssue[] {
  const persona = personaFor(role, stepTasks);
  if (persona === undefined) {
    return [
      {
        path: ["roles", index, "skill"],
        message: `Role ${role.id} names no persona and step task ${role.stepTask} declares no agent`,
      },
    ];
  }
  if (!PERSONA_IDS.has(persona)) {
    return [{ path: ["roles", index, "skill"], message: `Unknown persona: ${persona}` }];
  }
  if (persona === ORCHESTRATOR_PERSONA && role.stepTask !== CLOSEOUT_STEP_TASK) {
    return [
      {
        path: ["roles", index, "skill"],
        message: `The Orchestrator composes the team and closes it out; it cannot take ${role.stepTask}`,
      },
    ];
  }
  if (role.stepTask === CLOSEOUT_STEP_TASK && persona !== ORCHESTRATOR_PERSONA) {
    return [
      {
        path: ["roles", index, "skill"],
        message: `Only the Orchestrator closes a run out; ${persona} saw one step of it`,
      },
    ];
  }
  return [];
}

const VALIDATION_ORCHESTRATION_ID = "00000000";

const ORCHESTRATOR_PERSONA = "orchestrator";

const CLOSEOUT_STEP_TASK = "closeout-feature";

function duplicateIdIssues(roles: OrchestratorRole[]): ValidationIssue[] {
  const seen = new Set<string>();
  return roles.flatMap((role, index) => {
    if (seen.has(role.id)) {
      return [
        { path: ["roles", index, "id"], message: `Duplicate role id: ${role.id}` },
      ];
    }
    seen.add(role.id);
    return [];
  });
}

function toStage(role: OrchestratorRole, stepTasks: StepTaskVocabulary): StageDefinition {
  return {
    id: role.id,
    label: role.label,
    skill: personaFor(role, stepTasks),
    stepTask: role.stepTask,
    modelTier: role.modelTier,
    executionPolicy:
      role.stepTask === CLOSEOUT_STEP_TASK
        ? STAGE_EXECUTION_POLICIES.CLOSEOUT
        : role.executionPolicy ?? STAGE_EXECUTION_POLICIES.STANDARD,
    gateAfter: role.gateAfter,
    interactive: role.interactive,
  };
}

export function composedPipelineId(orchestrationId: string, generation: number): string {
  return `team-${orchestrationId}-${generation}`;
}

// Anchored to the whole composed shape, not just a trailing number: an
// orchestration id is eight hex characters and can be all digits, so a legacy
// `team-12345678` would otherwise read as generation 12345678.
const COMPOSED_PIPELINE_ID = /^team-[0-9a-f]{8}-(\d+)$/;

export function generationOf(pipelineId: string | undefined): number {
  const trailing = pipelineId?.match(COMPOSED_PIPELINE_ID)?.[1];
  return trailing === undefined ? 0 : Number(trailing);
}

export function sameComposition(
  left: PipelineDefinition | undefined,
  right: PipelineDefinition | undefined,
): boolean {
  if (left === undefined || right === undefined) {
    return false;
  }
  const shape = (pipeline: PipelineDefinition): string =>
    JSON.stringify(flattenPipelineStages(pipeline));
  return shape(left) === shape(right);
}

export function withRoleTiers(
  team: OrchestratorTeamProposal,
  roleTiers: Record<string, ModelTier | null> | undefined,
): ValidationResult<OrchestratorTeamProposal> {
  if (roleTiers === undefined) {
    return { ok: true, value: team };
  }
  const known = new Set(team.roles.map((role) => role.id));
  const issues = Object.keys(roleTiers)
    .filter((id) => !known.has(id))
    .map((id) => ({ path: ["roleTiers", id], message: `Unknown role id: ${id}` }));
  if (issues.length > 0) {
    return { ok: false, issues };
  }
  return {
    ok: true,
    value: {
      ...team,
      roles: team.roles.map((role) => ({
        ...role,
        modelTier: chosenTier(roleTiers, role),
      })),
    },
  };
}

function chosenTier(
  roleTiers: Record<string, ModelTier | null>,
  role: OrchestratorRole,
): ModelTier | undefined {
  const chosen = roleTiers[role.id];
  if (chosen === undefined) {
    return role.modelTier;
  }
  return chosen ?? undefined;
}

export function composeTeamPipeline(
  team: OrchestratorTeamProposal,
  stepTasks: StepTaskVocabulary,
  orchestrationId: string,
  generation = 1,
): ValidationResult<PipelineDefinition> {
  const issues = [
    ...team.roles.flatMap((role, index) => roleIssues(role, index, stepTasks)),
    ...duplicateIdIssues(team.roles),
  ];
  if (issues.length > 0) {
    return { ok: false, issues };
  }
  return {
    ok: true,
    value: {
      id: composedPipelineId(orchestrationId, generation),
      name: generation > 1 ? `${team.name} (team ${generation})` : team.name,
      description: team.summary,
      groups: [{ stages: team.roles.map((role) => toStage(role, stepTasks)) }],
    },
  };
}

export function teamProposalIssues(
  team: OrchestratorTeamProposal,
  stepTasks: StepTaskVocabulary,
): ValidationIssue[] {
  const composed = composeTeamPipeline(team, stepTasks, VALIDATION_ORCHESTRATION_ID);
  return composed.ok
    ? []
    : composed.issues.map((issue) => ({
        path: ["team", ...issue.path],
        message: issue.message,
      }));
}

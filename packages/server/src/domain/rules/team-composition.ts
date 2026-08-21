import { STAGE_EXECUTION_POLICIES, flattenPipelineStages } from "@isotopy/core";
import type {
  ModelTier,
  OrchestratorRole,
  OrchestratorTeamProposal,
  PipelineDefinition,
  StageDefinition,
} from "@isotopy/core";
import { PERSONA_CATALOG, STEP_TASK_CATALOG } from "../skills/catalog.ts";
import type { ValidationIssue, ValidationResult } from "../validation.ts";
import { SKILL_ID } from "./persona-notes.ts";



const PERSONA_IDS = new Set(PERSONA_CATALOG.map((entry) => entry.id));

const STEP_TASK_IDS = new Set(STEP_TASK_CATALOG.map((entry) => entry.id));

function roleIssues(role: OrchestratorRole, index: number): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!SKILL_ID.test(role.id)) {
    issues.push({
      path: ["roles", index, "id"],
      message: "Role id must contain only lowercase letters, digits, and hyphens",
    });
  }
  if (!PERSONA_IDS.has(role.skill)) {
    issues.push({
      path: ["roles", index, "skill"],
      message: `Unknown persona: ${role.skill}`,
    });
  }
  if (!STEP_TASK_IDS.has(role.stepTask)) {
    issues.push({
      path: ["roles", index, "stepTask"],
      message: `Unknown step task: ${role.stepTask}`,
    });
  }
  if (role.skill === ORCHESTRATOR_PERSONA && role.stepTask !== CLOSEOUT_STEP_TASK) {
    issues.push({
      path: ["roles", index, "skill"],
      message: `The Orchestrator composes the team and closes it out; it cannot take ${role.stepTask}`,
    });
  }
  if (role.stepTask === CLOSEOUT_STEP_TASK && role.skill !== ORCHESTRATOR_PERSONA) {
    issues.push({
      path: ["roles", index, "skill"],
      message: `Only the Orchestrator closes a run out; ${role.skill} saw one step of it`,
    });
  }
  return issues;
}

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

function toStage(role: OrchestratorRole): StageDefinition {
  return {
    id: role.id,
    label: role.label,
    skill: role.skill,
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
  orchestrationId: string,
  generation = 1,
): ValidationResult<PipelineDefinition> {
  const issues = [
    ...team.roles.flatMap(roleIssues),
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
      groups: [{ stages: team.roles.map(toStage) }],
    },
  };
}

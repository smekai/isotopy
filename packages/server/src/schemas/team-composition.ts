import { STAGE_EXECUTION_POLICIES } from "@adhd/core";
import type {
  ModelTier,
  OrchestratorRole,
  OrchestratorTeamProposal,
  PipelineDefinition,
  StageDefinition,
} from "@adhd/core";
import { PERSONA_CATALOG, STEP_TASK_CATALOG } from "../domain/skills/catalog.ts";
import type { ValidationIssue, ValidationResult } from "../domain/validation.ts";

const STAGE_ID = /^[a-z0-9-]+$/;

const PERSONA_IDS = new Set(PERSONA_CATALOG.map((entry) => entry.id));

const STEP_TASK_IDS = new Set(STEP_TASK_CATALOG.map((entry) => entry.id));

function roleIssues(role: OrchestratorRole, index: number): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!STAGE_ID.test(role.id)) {
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
  return issues;
}

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
    executionPolicy: role.executionPolicy ?? STAGE_EXECUTION_POLICIES.STANDARD,
    gateAfter: role.gateAfter,
    interactive: role.interactive,
  };
}

export function composedPipelineId(orchestrationId: string): string {
  return `team-${orchestrationId}`;
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
      id: composedPipelineId(orchestrationId),
      name: team.name,
      description: team.summary,
      groups: [{ stages: team.roles.map(toStage) }],
    },
  };
}

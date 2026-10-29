import { REVIEW_IMPLEMENTATION_STEP_TASK, STAGE_EXECUTION_POLICIES } from "@isotopy/core";
import type {
  PipelineDefinition,
  StageDefinition,
  TeamDefinition,
  TeamFlowStep,
  TeamRole,
} from "@isotopy/core";
import type { ValidationIssue, ValidationResult } from "../validation.ts";
import type { KnownAgentIds } from "./agent-catalog.ts";
import { SKILL_ID } from "./persona-notes.ts";

const ORCHESTRATOR_PERSONA = "orchestrator";

const CLOSEOUT_STEP_TASK = "closeout-feature";

const ID_MESSAGE = "must contain only lowercase letters, digits, and hyphens";

export function flowPipelineId(flowId: string): string {
  return `flow-${flowId}`;
}

function roleIssues(role: TeamRole, index: number, known: KnownAgentIds): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!SKILL_ID.test(role.id)) {
    issues.push({ path: ["roster", index, "id"], message: `Role id ${ID_MESSAGE}` });
  }
  if (!known.personas.has(role.agent)) {
    issues.push({ path: ["roster", index, "agent"], message: `Unknown agent: ${role.agent}` });
  }
  return issues;
}

function duplicateRoleIssues(roster: TeamRole[]): ValidationIssue[] {
  const seen = new Set<string>();
  return roster.flatMap((role, index) => {
    if (seen.has(role.id)) {
      return [{ path: ["roster", index, "id"], message: `Duplicate role id: ${role.id}` }];
    }
    seen.add(role.id);
    return [];
  });
}

function stepIssues(
  roles: ReadonlyMap<string, TeamRole>,
  entry: TeamFlowStep,
  path: (string | number)[],
  known: KnownAgentIds,
): ValidationIssue[] {
  const role = roles.get(entry.role);
  if (role === undefined) {
    return [{ path: [...path, "role"], message: `No role on the roster is called ${entry.role}` }];
  }
  if (!known.steps.has(entry.step)) {
    return [{ path: [...path, "step"], message: `Unknown step: ${entry.step}` }];
  }
  if (role.agent === ORCHESTRATOR_PERSONA && entry.step !== CLOSEOUT_STEP_TASK) {
    return [{ path: [...path, "step"], message: `The Orchestrator only closes a run out; it cannot take ${entry.step}` }];
  }
  if (entry.step === CLOSEOUT_STEP_TASK && role.agent !== ORCHESTRATOR_PERSONA) {
    return [{ path: [...path, "role"], message: `Only the Orchestrator closes a run out; ${role.agent} saw one step of it` }];
  }
  return [];
}

function flowIssues(
  roles: ReadonlyMap<string, TeamRole>,
  flowId: string,
  steps: TeamFlowStep[],
  known: KnownAgentIds,
): ValidationIssue[] {
  const path = ["flows", flowId];
  const idIssues = SKILL_ID.test(flowId) ? [] : [{ path, message: `Flow name ${ID_MESSAGE}` }];
  const seen = new Set<string>();
  const repeats = steps.flatMap((entry, index) => {
    const repeated = seen.has(entry.role);
    seen.add(entry.role);
    return repeated
      ? [{ path: [...path, index, "role"], message: `${entry.role} already has a step in this flow` }]
      : [];
  });
  return [
    ...idIssues,
    ...steps.flatMap((entry, index) => stepIssues(roles, entry, [...path, index], known)),
    ...repeats,
  ];
}

function rosterById(team: TeamDefinition): Map<string, TeamRole> {
  return new Map(team.roster.map((role) => [role.id, role]));
}

export function teamIssues(team: TeamDefinition, known: KnownAgentIds): ValidationIssue[] {
  const roles = rosterById(team);
  return [
    ...team.roster.flatMap((role, index) => roleIssues(role, index, known)),
    ...duplicateRoleIssues(team.roster),
    ...Object.entries(team.flows).flatMap(([flowId, steps]) => flowIssues(roles, flowId, steps, known)),
  ];
}

function reviewsImplementation(step: string): boolean {
  return step === REVIEW_IMPLEMENTATION_STEP_TASK;
}

function toStage(role: TeamRole, step: string): StageDefinition {
  return {
    id: role.id,
    label: role.label,
    skill: role.agent,
    stepTask: step,
    modelTier: role.modelTier,
    engine: role.engine ?? (reviewsImplementation(step) ? "secondary" : undefined),
    context: reviewsImplementation(step) ? "isolated" : undefined,
    executionPolicy:
      step === CLOSEOUT_STEP_TASK
        ? STAGE_EXECUTION_POLICIES.CLOSEOUT
        : role.executionPolicy ?? STAGE_EXECUTION_POLICIES.STANDARD,
    interactive: role.interactive,
  };
}

export function composeFlowPipeline(
  team: TeamDefinition,
  flowId: string,
  known: KnownAgentIds,
): ValidationResult<PipelineDefinition> {
  const steps = team.flows[flowId];
  if (steps === undefined) {
    const named = Object.keys(team.flows).join(", ");
    return { ok: false, issues: [{ path: ["flow"], message: `team.md has no flow called ${flowId}; it has ${named}` }] };
  }
  const issues = teamIssues(team, known);
  if (issues.length > 0) {
    return { ok: false, issues };
  }
  const roles = rosterById(team);
  return {
    ok: true,
    value: {
      id: flowPipelineId(flowId),
      name: `The team's ${flowId} flow`,
      description: steps.map((entry) => `${entry.role}: ${entry.step}`).join(" → "),
      groups: [
        {
          stages: steps.flatMap((entry) => {
            const role = roles.get(entry.role);
            return role === undefined ? [] : [toStage(role, entry.step)];
          }),
        },
      ],
    },
  };
}

import type {
  Orchestration,
  OrchestratorRole,
  OrchestratorTeamProposal,
  RunSummary,
} from "@adhd/core";
import { HOME_PROJECT_ID } from "@adhd/core";
import { summary } from "./run-fixtures";

const CREATED_AT = "2026-08-01T09:00:00.000Z";

export const ORCHESTRATION_ID = "o1";

export function role(overrides: Partial<OrchestratorRole> = {}): OrchestratorRole {
  return {
    ...overrides,
    id: overrides.id ?? "implementation",
    label: overrides.label ?? "Developer",
    skill: overrides.skill ?? "developer",
    stepTask: overrides.stepTask ?? "implement",
  };
}

export function team(
  overrides: Partial<OrchestratorTeamProposal> = {},
): OrchestratorTeamProposal {
  return {
    name: overrides.name ?? "Delivery trio",
    summary: overrides.summary ?? "A PM, a Developer and a QA Engineer.",
    roles: overrides.roles ?? [role()],
  };
}

export function orchestration(
  overrides: Partial<Orchestration> = {},
): Orchestration {
  return {
    ...overrides,
    id: overrides.id ?? ORCHESTRATION_ID,
    projectId: overrides.projectId ?? HOME_PROJECT_ID,
    goal: overrides.goal ?? "Ship the settings screen",
    status: overrides.status ?? "conversing",
    turns: overrides.turns ?? [],
    runIds: overrides.runIds ?? [],
    createdAt: overrides.createdAt ?? CREATED_AT,
    updatedAt: overrides.updatedAt ?? CREATED_AT,
  };
}

export function orchestratedRun(
  id: string,
  createdAt: string,
  overrides: Partial<RunSummary> = {},
): RunSummary {
  return summary({ id, createdAt, orchestrationId: ORCHESTRATION_ID, ...overrides });
}

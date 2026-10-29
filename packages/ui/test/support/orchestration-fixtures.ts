import type { Orchestration, OrchestratorDecision, RunSummary, ScheduleView } from "@isotopy/core";
import { HOME_PROJECT_ID } from "@isotopy/core";
import { summary } from "./run-fixtures";

const CREATED_AT = "2026-08-01T09:00:00.000Z";

export const ORCHESTRATION_ID = "o1";

export const CURRENT_TEAM = "---\nroster:\n  - id: implementation\n---\n";

export const PROPOSED_TEAM = "---\nroster:\n  - id: implementation\n  - id: test\n---\n";

export type TeamChangeDecision = Extract<OrchestratorDecision, { action: "propose_team_change" }>;

export function teamChange(overrides: Partial<TeamChangeDecision> = {}): TeamChangeDecision {
  return {
    action: "propose_team_change",
    rationale: overrides.rationale ?? "Verification keeps coming back on its own",
    team: overrides.team ?? PROPOSED_TEAM,
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

export function scheduleView(overrides: Partial<ScheduleView> = {}): ScheduleView {
  return {
    ...overrides,
    id: overrides.id ?? "s1",
    projectId: overrides.projectId ?? HOME_PROJECT_ID,
    name: overrides.name ?? "Board poller",
    cron: overrides.cron ?? "0 9 * * *",
    timezone: overrides.timezone ?? "UTC",
    task: overrides.task ?? "Take the next task off the board",
    flow: overrides.flow,
    enabled: overrides.enabled ?? true,
    createdAt: overrides.createdAt ?? CREATED_AT,
    updatedAt: overrides.updatedAt ?? CREATED_AT,
  };
}

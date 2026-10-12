import type { OrchestratorTeamProposal } from "@isotopy/core";
import type { ValidationIssue } from "../validation.ts";
import type { KnownAgentIds } from "./agent-catalog.ts";
import { teamProposalIssues } from "./team-composition.ts";
import { scheduleCronIssues } from "./schedule-timing.ts";

export interface ScheduleDefinition {
  cron: string;
  timezone: string;
  team?: OrchestratorTeamProposal;
}

export function scheduleIssues(
  definition: ScheduleDefinition,
  known: KnownAgentIds,
): ValidationIssue[] {
  const cron = scheduleCronIssues(definition.cron, definition.timezone);
  if (definition.team === undefined) {
    return cron;
  }
  return [...cron, ...teamProposalIssues(definition.team, known)];
}

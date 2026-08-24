import type { OrchestratorTeamProposal } from "@isotopy/core";
import type { ValidationIssue } from "../validation.ts";
import { composeTeamPipeline } from "./team-composition.ts";
import { scheduleCronIssues } from "./schedule-cron.ts";

export interface ScheduleDefinition {
  cron: string;
  timezone: string;
  team: OrchestratorTeamProposal;
}

const VALIDATION_ORCHESTRATION_ID = "00000000";

function teamIssues(team: OrchestratorTeamProposal): ValidationIssue[] {
  const composed = composeTeamPipeline(team, VALIDATION_ORCHESTRATION_ID);
  return composed.ok
    ? []
    : composed.issues.map((issue) => ({
        path: ["team", ...issue.path],
        message: issue.message,
      }));
}

export function scheduleIssues(definition: ScheduleDefinition): ValidationIssue[] {
  return [
    ...scheduleCronIssues(definition.cron, definition.timezone),
    ...teamIssues(definition.team),
  ];
}

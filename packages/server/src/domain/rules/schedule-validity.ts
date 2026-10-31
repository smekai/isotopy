import type { ProjectTeam } from "@isotopy/core";
import type { ValidationIssue } from "../validation.ts";
import { scheduleCronIssues } from "./schedule-timing.ts";

export interface ScheduleDefinition {
  cron: string;
  timezone: string;
  flow?: string;
}

function flowIssues(flow: string, team: ProjectTeam): ValidationIssue[] {
  if (team.state === "invalid") {
    return [{ path: ["flow"], message: `team.md is not valid, so no flow can be named: ${team.issues.join("; ")}` }];
  }
  return Object.hasOwn(team.team.flows, flow)
    ? []
    : [{ path: ["flow"], message: `The team has no flow called ${flow}` }];
}

export function scheduleIssues(definition: ScheduleDefinition, team: ProjectTeam): ValidationIssue[] {
  const cron = scheduleCronIssues(definition.cron, definition.timezone);
  return definition.flow === undefined ? cron : [...cron, ...flowIssues(definition.flow, team)];
}

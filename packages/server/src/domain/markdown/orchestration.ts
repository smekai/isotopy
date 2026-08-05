import type { OrchestratorTeamProposal } from "@adhd/core";
import type { CatalogEntry } from "../skills/catalog.ts";
import { bullet, markdownBlocks, markdownBody } from "./format.ts";

export interface OrchestrationContext {
  goal: string;
  personas: CatalogEntry[];
  stepTasks: CatalogEntry[];
  boardContext: string;
  closeoutContext: string;
}

export interface ComposedRunContext {
  goal: string;
  team: OrchestratorTeamProposal;
}

function renderCatalog(heading: string, entries: CatalogEntry[]): string {
  return markdownBlocks([
    `## ${heading}`,
    entries.map((entry) => bullet(`\`${entry.id}\` — ${entry.summary}`)).join("\n"),
  ]);
}

export function renderOrchestrationContext({
  goal,
  personas,
  stepTasks,
  boardContext,
  closeoutContext,
}: OrchestrationContext): string {
  return markdownBlocks([
    `## Orchestration goal\n\n${markdownBody(goal)}`,
    renderCatalog("Persona catalog", personas),
    renderCatalog("Step task catalog", stepTasks),
    markdownBody(boardContext),
    markdownBody(closeoutContext),
  ]);
}

function renderRoles(team: OrchestratorTeamProposal): string {
  return team.roles
    .map((role) =>
      bullet(
        `**${role.label}** (\`${role.id}\`) — ${role.rationale ?? role.stepTask}`,
      ),
    )
    .join("\n");
}

export function renderComposedRunTask({ goal, team }: ComposedRunContext): string {
  return markdownBlocks([
    `## Goal\n\n${markdownBody(goal)}`,
    `## Approved team: ${team.name}\n\n${markdownBody(team.summary)}`,
    renderRoles(team),
  ]);
}

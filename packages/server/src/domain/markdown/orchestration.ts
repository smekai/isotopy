import type { CatalogEntry } from "../skills/catalog.ts";
import { bullet, markdownBlocks, markdownBody } from "./format.ts";

export interface OrchestrationContext {
  goal: string;
  personas: CatalogEntry[];
  stepTasks: CatalogEntry[];
  boardContext: string;
  closeoutContext: string;
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

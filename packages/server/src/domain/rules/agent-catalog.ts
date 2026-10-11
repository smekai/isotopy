import type { AgentOrigin } from "@isotopy/core";

export const UNKNOWN_AGENT_GLYPH = "◈";

export interface CatalogPersona {
  id: string;
  title: string;
  glyph: string;
  description: string;
  origin: AgentOrigin;
  body: string;
}

export interface CatalogStep {
  id: string;
  description: string;
  composable: boolean;
  origin: AgentOrigin;
  body: string;
}

export interface AgentCatalogSnapshot {
  personas: CatalogPersona[];
  steps: CatalogStep[];
}

export interface KnownAgentIds {
  personas: ReadonlySet<string>;
  steps: ReadonlySet<string>;
}

export interface CatalogEntry {
  id: string;
  summary: string;
}

export interface CatalogLines {
  personas: CatalogEntry[];
  stepTasks: CatalogEntry[];
}

export function mergeCatalog(
  bundled: AgentCatalogSnapshot,
  project: AgentCatalogSnapshot,
): AgentCatalogSnapshot {
  const internal = new Set(bundled.steps.filter((step) => !step.composable).map((step) => step.id));
  return {
    personas: mergeById(bundled.personas, project.personas),
    steps: mergeById(
      bundled.steps,
      project.steps.map((step) => (internal.has(step.id) ? { ...step, composable: false } : step)),
    ),
  };
}

export function knownAgentIds(snapshot: AgentCatalogSnapshot): KnownAgentIds {
  return {
    personas: new Set(snapshot.personas.map((persona) => persona.id)),
    steps: new Set(snapshot.steps.filter((step) => step.composable).map((step) => step.id)),
  };
}

export function catalogLines(snapshot: AgentCatalogSnapshot): CatalogLines {
  return {
    personas: snapshot.personas.map((persona) => ({
      id: persona.id,
      summary: `${persona.title} — ${persona.description}`,
    })),
    stepTasks: snapshot.steps
      .filter((step) => step.composable)
      .map((step) => ({ id: step.id, summary: step.description })),
  };
}

function mergeById<Entry extends { id: string }>(base: Entry[], overrides: Entry[]): Entry[] {
  const replacements = new Map(overrides.map((entry) => [entry.id, entry]));
  const baseIds = new Set(base.map((entry) => entry.id));
  return [
    ...base.map((entry) => replacements.get(entry.id) ?? entry),
    ...overrides.filter((entry) => !baseIds.has(entry.id)),
  ];
}

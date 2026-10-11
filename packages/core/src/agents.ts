import { z } from "zod";

export const AGENT_ORIGINS = ["bundled", "project", "pack"] as const;

export type AgentOrigin = (typeof AGENT_ORIGINS)[number];

export const UNKNOWN_AGENT_GLYPH = "◈";

export interface CatalogAgent {
  kind: "agent";
  id: string;
  title: string;
  glyph: string;
  description: string;
  origin: AgentOrigin;
}

export interface CatalogStepTask {
  kind: "step";
  id: string;
  description: string;
  origin: AgentOrigin;
}

export type AgentCatalogEntry = CatalogAgent | CatalogStepTask;

export interface AgentLook {
  title: string;
  glyph: string;
}

export function catalogAgentLook(agents: readonly CatalogAgent[], skill: string): AgentLook {
  const agent = agents.find((candidate) => candidate.id === skill);
  return agent === undefined
    ? { title: skill, glyph: UNKNOWN_AGENT_GLYPH }
    : { title: agent.title, glyph: agent.glyph };
}

const packInputText = z.string().trim().min(1);

export const installPackRequestSchema = z
  .object({
    source: packInputText,
    ref: packInputText.optional(),
    path: packInputText.optional(),
  })
  .strict();

export type InstallPackRequest = z.infer<typeof installPackRequestSchema>;

export interface PackInstallResult {
  source: string;
  ref?: string;
  path?: string;
  commit?: string;
  installedAt: string;
  written: string[];
  removed: string[];
  kept: string[];
}

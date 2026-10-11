export const AGENT_ORIGINS = ["bundled", "project"] as const;

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

export interface AgentDefinition {
  skill: string;
  profession: string;
  glyph: string;
}

export const AGENTS: Record<string, AgentDefinition> = {
  solo: { skill: "solo", profession: "Agent", glyph: "✦" },
  orchestrator: { skill: "orchestrator", profession: "Orchestrator", glyph: "❖" },
  "project-manager": {
    skill: "project-manager",
    profession: "Product Manager",
    glyph: "◈",
  },
  "product-designer": {
    skill: "product-designer",
    profession: "Product Designer",
    glyph: "◐",
  },
  "software-architect": {
    skill: "software-architect",
    profession: "Software Architect",
    glyph: "◇",
  },
  architect: { skill: "architect", profession: "Architect", glyph: "◇" },
  developer: { skill: "developer", profession: "Developer", glyph: "⬡" },
  tester: { skill: "tester", profession: "QA Engineer", glyph: "⊕" },
  "release-manager": {
    skill: "release-manager",
    profession: "Release Manager",
    glyph: "◆",
  },
  sre: { skill: "sre", profession: "SRE", glyph: "▲" },
};

export interface StageIdentity {
  id: string;
  skill?: string;
}

export function agentForSkill(skill: string): AgentDefinition {
  return AGENTS[skill] ?? { skill, profession: skill, glyph: "◈" };
}

export function agentForStage(stage: StageIdentity): AgentDefinition {
  return agentForSkill(stage.skill ?? stage.id);
}

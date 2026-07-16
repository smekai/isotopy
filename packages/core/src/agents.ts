export interface AgentDefinition {
  stageId: string;
  profession: string;
  glyph: string;
}

export const AGENTS: Record<string, AgentDefinition> = {
  intake: { stageId: "intake", profession: "Project Manager", glyph: "◈" },
  requirements: { stageId: "requirements", profession: "Business Analyst", glyph: "◉" },
  design: { stageId: "design", profession: "Software Architect", glyph: "◇" },
  implementation: { stageId: "implementation", profession: "Developer", glyph: "⬡" },
  review: { stageId: "review", profession: "Code Reviewer", glyph: "◎" },
  test: { stageId: "test", profession: "QA Engineer", glyph: "⊕" },
  release: { stageId: "release", profession: "Release Manager", glyph: "◆" },
  deploy: { stageId: "deploy", profession: "SRE", glyph: "▲" },
};

export function agentForStage(stageId: string): AgentDefinition {
  return AGENTS[stageId] ?? { stageId, profession: stageId, glyph: "◈" };
}

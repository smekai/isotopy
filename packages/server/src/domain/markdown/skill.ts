import { markdownBlocks, markdownBody } from "./format.ts";

export interface SkillLayers {
  base?: string;
  projectOverride?: string;
  projectAddendum?: string;
}

export function composeSkill({
  base,
  projectOverride,
  projectAddendum,
}: SkillLayers): string | undefined {
  const body = projectOverride ?? base;
  const addendum = projectAddendum ? markdownBody(projectAddendum) : "";
  if (body === undefined) {
    return addendum || undefined;
  }
  return markdownBlocks([
    markdownBody(body),
    addendum ? `## Project-specific instructions\n\n${addendum}` : undefined,
  ]);
}

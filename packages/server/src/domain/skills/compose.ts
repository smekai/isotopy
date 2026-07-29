export interface SkillLayers {
  base?: string;
  projectOverride?: string;
  projectAddendum?: string;
}

const ADDENDUM_HEADING = "## Project-specific instructions";

export function composeSkill({
  base,
  projectOverride,
  projectAddendum,
}: SkillLayers): string | undefined {
  const body = projectOverride ?? base;
  if (body === undefined) {
    return projectAddendum === undefined ? undefined : projectAddendum.trim();
  }
  if (projectAddendum === undefined || projectAddendum.trim() === "") {
    return body;
  }
  return `${body.trimEnd()}\n\n${ADDENDUM_HEADING}\n\n${projectAddendum.trim()}\n`;
}

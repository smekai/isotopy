import { markdownBlocks, markdownBody } from "./format.ts";

export interface SkillLayers {
  base?: string;
  projectOverride?: string;
  projectAddendum?: string;
  accumulatedNotes?: string;
}

const LEARNED_HEADING = "## What earlier runs taught you about this project";

const LEARNED_PREAMBLE =
  "These are your own notes from earlier runs in this project. Treat them as established unless this run shows otherwise, and do not spend the run rediscovering them.";

export function composeSkill({
  base,
  projectOverride,
  projectAddendum,
  accumulatedNotes,
}: SkillLayers): string | undefined {
  const body = projectOverride ?? base;
  const addendum = projectAddendum ? markdownBody(projectAddendum) : "";
  const notes = accumulatedNotes ? markdownBody(accumulatedNotes) : "";
  const learned = notes
    ? `${LEARNED_HEADING}\n\n${LEARNED_PREAMBLE}\n\n${notes}`
    : undefined;
  if (body === undefined) {
    return markdownBlocks([addendum || undefined, learned]) || undefined;
  }
  return markdownBlocks([
    markdownBody(body),
    addendum ? `## Project-specific instructions\n\n${addendum}` : undefined,
    learned,
  ]);
}

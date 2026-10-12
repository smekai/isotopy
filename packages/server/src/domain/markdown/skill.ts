import { bullet, markdownBlocks, markdownBody } from "./format.ts";

export interface KnowledgeEntry {
  path: string;
  description?: string;
}

export interface SkillLayers {
  base?: string;
  knowledge?: KnowledgeEntry[];
  projectAddendum?: string;
  accumulatedNotes?: string;
}

const LIBRARY_HEADING = "## Your reference library";

const LIBRARY_PREAMBLE =
  "These files are kept for you to consult. Before you start, read the ones this step needs. They are reference material for you to read, not to edit; what you learn on this run belongs in your notes.";

const LEARNED_HEADING = "## What earlier runs taught you about this project";

const LEARNED_PREAMBLE =
  "These are your own notes from earlier runs in this project. Treat them as established unless this run shows otherwise, and do not spend the run rediscovering them.";

export function composeSkill({
  base: body,
  knowledge = [],
  projectAddendum,
  accumulatedNotes,
}: SkillLayers): string | undefined {
  const library = renderLibrary(knowledge);
  const addendum = projectAddendum ? markdownBody(projectAddendum) : "";
  const notes = accumulatedNotes ? markdownBody(accumulatedNotes) : "";
  const learned = notes
    ? `${LEARNED_HEADING}\n\n${LEARNED_PREAMBLE}\n\n${notes}`
    : undefined;
  if (body === undefined) {
    return markdownBlocks([library, addendum || undefined, learned]) || undefined;
  }
  return markdownBlocks([
    markdownBody(body),
    library,
    addendum ? `## Project-specific instructions\n\n${addendum}` : undefined,
    learned,
  ]);
}

function renderLibrary(knowledge: KnowledgeEntry[]): string | undefined {
  if (knowledge.length === 0) {
    return undefined;
  }
  const entries = knowledge.map((entry) =>
    bullet(
      entry.description === undefined
        ? `\`${entry.path}\``
        : `\`${entry.path}\` — ${entry.description}`,
    ),
  );
  return `${LIBRARY_HEADING}\n\n${LIBRARY_PREAMBLE}\n\n${entries.join("\n")}`;
}

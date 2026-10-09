import { readdir } from "node:fs/promises";
import {
  SKILL_ID,
  mergePersonaNotes,
  parsePersonaNotes,
  renderPersonaNotes,
} from "../domain/rules/persona-notes.ts";
import type { PersonaNoteSet } from "../domain/rules/persona-notes.ts";
import { ensureProjectDataDir, skillsDir } from "../paths.ts";
import type { ProjectPath } from "../paths.ts";
import { formatValidationIssues } from "../domain/validation.ts";
import { extractPersonaNotes } from "../schemas/persona-notes.ts";
import { readOptionalText, writeTextFile } from "../utils/text-file.ts";
import { personaNotesPath } from "./skills.ts";

const NOTES_SUFFIX = ".notes.md";

export interface PersonaNotesCapture {
  report: string;
  issue?: string;
}

export async function capturePersonaNotes(
  projectPath: ProjectPath,
  skillId: string | undefined,
  output: string,
): Promise<PersonaNotesCapture> {
  const { report, notes } = extractPersonaNotes(output);
  if (notes === undefined) {
    return { report };
  }
  if (!notes.ok) {
    return { report, issue: formatValidationIssues(notes.issues) };
  }
  if (skillId === undefined || !SKILL_ID.test(skillId)) {
    return { report, issue: `No persona owns this stage, so its notes have nowhere to go` };
  }
  const file = personaNotesPath(projectPath, skillId);
  const merged = mergePersonaNotes(parsePersonaNotes(await readOptionalText(file)), notes.value.notes);
  await ensureProjectDataDir(projectPath);
  await writeTextFile(file, renderPersonaNotes(merged));
  return { report };
}

export async function personaNotesByRole(
  projectPath: ProjectPath,
): Promise<PersonaNoteSet[]> {
  const entries = await readdir(skillsDir(projectPath)).catch(() => []);
  const roles = entries
    .filter((entry) => entry.endsWith(NOTES_SUFFIX))
    .map((entry) => entry.slice(0, -NOTES_SUFFIX.length))
    .filter((skillId) => SKILL_ID.test(skillId))
    .sort();
  const sets = await Promise.all(
    roles.map(async (skillId) => ({
      skillId,
      notes: parsePersonaNotes(await readOptionalText(personaNotesPath(projectPath, skillId))),
    })),
  );
  return sets.filter((set) => set.notes.length > 0);
}

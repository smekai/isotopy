import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
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
  const existing = parsePersonaNotes(
    await readFile(file, "utf8").catch(() => undefined),
  );
  const merged = mergePersonaNotes(existing, notes.value.notes);
  await ensureProjectDataDir(projectPath);
  await mkdir(skillsDir(projectPath), { recursive: true });
  const temporary = `${file}.tmp`;
  await writeFile(temporary, `${renderPersonaNotes(merged)}\n`, "utf8");
  await rename(temporary, file);
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
      notes: parsePersonaNotes(
        await readFile(personaNotesPath(projectPath, skillId), "utf8").catch(
          () => undefined,
        ),
      ),
    })),
  );
  return sets.filter((set) => set.notes.length > 0);
}

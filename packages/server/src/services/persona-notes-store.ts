import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import {
  mergePersonaNotes,
  parsePersonaNotes,
  renderPersonaNotes,
} from "../domain/rules/persona-notes.ts";
import { ensureProjectDataDir, skillsDir } from "../paths.ts";
import type { ProjectPath } from "../paths.ts";
import { extractPersonaNotes } from "../schemas/persona-notes.ts";
import { personaNotesPath } from "./skills.ts";

const NOTES_ID = /^[a-z0-9-]+$/;
const NOTES_SUFFIX = ".notes.md";

export interface PersonaNoteSet {
  skillId: string;
  notes: string[];
}

export async function capturePersonaNotes(
  projectPath: ProjectPath,
  skillId: string | undefined,
  output: string,
): Promise<string[] | undefined> {
  if (skillId === undefined || !NOTES_ID.test(skillId)) {
    return undefined;
  }
  const parsed = extractPersonaNotes(output);
  if (parsed === undefined || !parsed.ok) {
    return undefined;
  }
  const file = personaNotesPath(projectPath, skillId);
  const existing = parsePersonaNotes(
    await readFile(file, "utf8").catch(() => undefined),
  );
  const merged = mergePersonaNotes(existing, parsed.value.notes);
  await ensureProjectDataDir(projectPath);
  await mkdir(skillsDir(projectPath), { recursive: true });
  const temporary = `${file}.tmp`;
  await writeFile(temporary, `${renderPersonaNotes(merged)}\n`, "utf8");
  await rename(temporary, file);
  return merged;
}

export async function personaNotesByRole(
  projectPath: ProjectPath,
): Promise<PersonaNoteSet[]> {
  const entries = await readdir(skillsDir(projectPath)).catch(() => []);
  const roles = entries
    .filter((entry) => entry.endsWith(NOTES_SUFFIX))
    .map((entry) => entry.slice(0, -NOTES_SUFFIX.length))
    .filter((skillId) => NOTES_ID.test(skillId))
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

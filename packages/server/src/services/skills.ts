import path from "node:path";
import { skillsDir, userSkillsDir } from "../paths.ts";
import type { ProjectPath } from "../paths.ts";
import { composeSkill } from "../domain/markdown/skill.ts";
import { readCachedText } from "../utils/text-file-cache.ts";
import { loadBundledPersona } from "./skill-assets.ts";

export function userSkillFilePath(skillId: string): string {
  return path.join(userSkillsDir(), `${skillId}.md`);
}

export function projectSkillFilePath(projectPath: ProjectPath, skillId: string): string {
  return path.join(skillsDir(projectPath), `${skillId}.md`);
}

export function projectSkillAddendumPath(projectPath: ProjectPath, skillId: string): string {
  return path.join(skillsDir(projectPath), `${skillId}.project.md`);
}

export function personaNotesPath(projectPath: ProjectPath, skillId: string): string {
  return path.join(skillsDir(projectPath), `${skillId}.notes.md`);
}

export async function loadSkill(
  projectPath: ProjectPath,
  skillId: string,
): Promise<string | undefined> {
  const [bundled, userOverride, projectOverride, projectAddendum, accumulatedNotes] =
    await Promise.all([
      loadBundledPersona(skillId),
      readCachedText(userSkillFilePath(skillId)),
      readCachedText(projectSkillFilePath(projectPath, skillId)),
      readCachedText(projectSkillAddendumPath(projectPath, skillId)),
      readCachedText(personaNotesPath(projectPath, skillId)),
    ]);
  return composeSkill({
    base: userOverride ?? bundled,
    projectOverride,
    projectAddendum,
    accumulatedNotes,
  });
}

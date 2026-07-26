import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { skillsDir, userSkillsDir } from "../paths.ts";
import type { ProjectPath } from "../paths.ts";
import { composeSkill } from "../domain/skills/compose.ts";
import { DEFAULT_SKILLS } from "../domain/skills/defaults.generated.ts";

interface CacheEntry {
  mtimeMs: number;
  content: string;
}

const cache = new Map<string, CacheEntry>();

export function userSkillFilePath(skillId: string): string {
  return path.join(userSkillsDir(), `${skillId}.md`);
}

export function projectSkillFilePath(projectPath: ProjectPath, skillId: string): string {
  return path.join(skillsDir(projectPath), `${skillId}.md`);
}

export function projectSkillAddendumPath(projectPath: ProjectPath, skillId: string): string {
  return path.join(skillsDir(projectPath), `${skillId}.project.md`);
}

async function readCached(filePath: string): Promise<string | undefined> {
  try {
    const { mtimeMs } = await stat(filePath);
    const cached = cache.get(filePath);
    if (cached && cached.mtimeMs === mtimeMs) {
      return cached.content;
    }
    const content = await readFile(filePath, "utf8");
    cache.set(filePath, { mtimeMs, content });
    return content;
  } catch {
    cache.delete(filePath);
    return undefined;
  }
}

export async function loadSkill(
  projectPath: ProjectPath,
  skillId: string,
): Promise<string | undefined> {
  const [userOverride, projectOverride, projectAddendum] = await Promise.all([
    readCached(userSkillFilePath(skillId)),
    readCached(projectSkillFilePath(projectPath, skillId)),
    readCached(projectSkillAddendumPath(projectPath, skillId)),
  ]);
  return composeSkill({
    base: userOverride ?? DEFAULT_SKILLS[skillId],
    projectOverride,
    projectAddendum,
  });
}

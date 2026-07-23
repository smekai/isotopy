import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { skillsDir, userSkillsDir } from "../paths.js";
import type { ProjectPaths } from "../paths.js";
import { composeSkill } from "../domain/skills/compose.js";
import { DEFAULT_SKILLS } from "../domain/skills/defaults.generated.js";

interface CacheEntry {
  mtimeMs: number;
  content: string;
}

const cache = new Map<string, CacheEntry>();

export function userSkillFilePath(skillId: string): string {
  return path.join(userSkillsDir(), `${skillId}.md`);
}

export function projectSkillFilePath(paths: ProjectPaths, skillId: string): string {
  return path.join(skillsDir(paths), `${skillId}.md`);
}

export function projectSkillAddendumPath(paths: ProjectPaths, skillId: string): string {
  return path.join(skillsDir(paths), `${skillId}.project.md`);
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
  paths: ProjectPaths,
  skillId: string,
): Promise<string | undefined> {
  const [userOverride, projectOverride, projectAddendum] = await Promise.all([
    readCached(userSkillFilePath(skillId)),
    readCached(projectSkillFilePath(paths, skillId)),
    readCached(projectSkillAddendumPath(paths, skillId)),
  ]);
  return composeSkill({
    base: userOverride ?? DEFAULT_SKILLS[skillId],
    projectOverride,
    projectAddendum,
  });
}

import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { skillsDir, userSkillsDir } from "../paths.ts";
import type { ProjectPath } from "../paths.ts";
import { composeSkill } from "../domain/markdown/skill.ts";

export function loadBundledPersona(id: string): Promise<string | undefined> {
  return loadBundledMarkdown(PERSONA_DIR, id);
}

export function loadBundledStepTask(id: string): Promise<string | undefined> {
  return loadBundledMarkdown(STEP_TASK_DIR, id);
}

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
      readCached(userSkillFilePath(skillId)),
      readCached(projectSkillFilePath(projectPath, skillId)),
      readCached(projectSkillAddendumPath(projectPath, skillId)),
      readCached(personaNotesPath(projectPath, skillId)),
    ]);
  return composeSkill({
    base: userOverride ?? bundled,
    projectOverride,
    projectAddendum,
    accumulatedNotes,
  });
}

const PROMPT_ID = /^[a-z0-9-]+$/;
const PERSONA_DIR = new URL("../domain/skills/personas/", import.meta.url);
const STEP_TASK_DIR = new URL("../domain/skills/step-tasks/", import.meta.url);

async function loadBundledMarkdown(
  directory: URL,
  id: string,
): Promise<string | undefined> {
  if (!PROMPT_ID.test(id)) {
    return undefined;
  }
  try {
    return await readFile(fileURLToPath(new URL(`${id}.md`, directory)), "utf8");
  } catch {
    return undefined;
  }
}

interface CacheEntry {
  mtimeMs: number;
  content: string;
}

const cache = new Map<string, CacheEntry>();

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

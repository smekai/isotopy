import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { adhdDir } from "../paths.js";
import { DEFAULT_SKILLS } from "../domain/skills/defaults.js";

function skillsDir(): string {
  return path.join(adhdDir(), "skills");
}

interface CacheEntry {
  mtimeMs: number;
  content: string;
}

const cache = new Map<string, CacheEntry>();

export function skillFilePath(skillId: string): string {
  return path.join(skillsDir(), `${skillId}.md`);
}

async function seedSkillFile(skillId: string, content: string): Promise<void> {
  try {
    await mkdir(skillsDir(), { recursive: true });
    await writeFile(skillFilePath(skillId), content, { flag: "wx" });
  } catch {}
}

export async function loadSkill(skillId: string): Promise<string | undefined> {
  const filePath = skillFilePath(skillId);
  try {
    const { mtimeMs } = await stat(filePath);
    const cached = cache.get(filePath);
    if (cached && cached.mtimeMs === mtimeMs) {
      return cached.content;
    }
    const content = await readFile(filePath, "utf8");
    cache.set(filePath, { mtimeMs, content });
    return content;
  } catch {}

  const fallback = DEFAULT_SKILLS[skillId];
  if (fallback === undefined) {
    return undefined;
  }
  await seedSkillFile(skillId, fallback);
  return fallback;
}

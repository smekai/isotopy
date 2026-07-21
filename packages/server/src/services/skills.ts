// Loads the persona ("skill") a pipeline stage runs as. Skills are markdown
// files under .adhd/skills/<id>.md so they can be tweaked and re-run without a
// rebuild. That directory is gitignored, so the bundled text in skill-defaults
// is the shipped source of truth: a missing file is seeded from the default on
// first use, giving the user a copy to edit rather than an invisible feature.
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { REPO_ROOT } from "../paths.js";
import { DEFAULT_SKILLS } from "./skill-defaults.js";

const SKILLS_DIR = path.join(REPO_ROOT, ".adhd", "skills");

interface CacheEntry {
  /** mtime the content was read at — a newer file invalidates the entry. */
  mtimeMs: number;
  content: string;
}

const cache = new Map<string, CacheEntry>();

export function skillFilePath(skillId: string): string {
  return path.join(SKILLS_DIR, `${skillId}.md`);
}

/** Best-effort write of a default persona so the user has something to edit. */
async function seedSkillFile(skillId: string, content: string): Promise<void> {
  try {
    await mkdir(SKILLS_DIR, { recursive: true });
    // "wx" — never clobber a file the user already wrote.
    await writeFile(skillFilePath(skillId), content, { flag: "wx" });
  } catch {
    // Seeding is a convenience; a read-only or racing FS must not fail the run.
  }
}

/**
 * Resolve a stage's persona text. Prefers the on-disk `.adhd/skills/<id>.md`
 * (re-read whenever its mtime changes, so edits apply to the next run) and
 * falls back to the bundled default, seeding the file when it is absent.
 *
 * Returns undefined for an unknown skill with no file — the caller then runs
 * the stage without a persona rather than failing the run.
 */
export async function loadSkill(skillId: string): Promise<string | undefined> {
  const filePath = skillFilePath(skillId);
  try {
    const { mtimeMs } = await stat(filePath);
    const cached = cache.get(skillId);
    if (cached && cached.mtimeMs === mtimeMs) {
      return cached.content;
    }
    const content = await readFile(filePath, "utf8");
    cache.set(skillId, { mtimeMs, content });
    return content;
  } catch {
    // No readable file — fall back to the bundled default.
  }

  const fallback = DEFAULT_SKILLS[skillId];
  if (fallback === undefined) {
    return undefined;
  }
  await seedSkillFile(skillId, fallback);
  return fallback;
}

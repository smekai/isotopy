import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { SKILL_ID } from "../domain/rules/persona-notes.ts";

const PERSONA_DIR = new URL("../domain/skills/personas/", import.meta.url);

const STEP_TASK_DIR = new URL("../domain/skills/step-tasks/", import.meta.url);

const MARKDOWN_SUFFIX = ".md";

export function loadBundledPersona(id: string): Promise<string | undefined> {
  return loadBundledMarkdown(PERSONA_DIR, id);
}

export function loadBundledStepTask(id: string): Promise<string | undefined> {
  return loadBundledMarkdown(STEP_TASK_DIR, id);
}

export function listBundledStepTaskIds(): Promise<string[]> {
  return markdownIdsIn(fileURLToPath(STEP_TASK_DIR));
}

export async function markdownIdsIn(directory: string): Promise<string[]> {
  try {
    const entries = await readdir(directory);
    return entries
      .filter((entry) => entry.endsWith(MARKDOWN_SUFFIX))
      .map((entry) => entry.slice(0, -MARKDOWN_SUFFIX.length))
      .filter((id) => SKILL_ID.test(id));
  } catch {
    return [];
  }
}

async function loadBundledMarkdown(directory: URL, id: string): Promise<string | undefined> {
  if (!SKILL_ID.test(id)) {
    return undefined;
  }
  try {
    return await readFile(fileURLToPath(new URL(`${id}${MARKDOWN_SUFFIX}`, directory)), "utf8");
  } catch {
    return undefined;
  }
}

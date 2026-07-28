import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const PROMPT_ID = /^[a-z0-9-]+$/;
const PERSONA_DIR = new URL("../domain/skills/personas/", import.meta.url);
const STEP_TASK_DIR = new URL("../domain/skills/step-tasks/", import.meta.url);

async function loadMarkdown(directory: URL, id: string): Promise<string | undefined> {
  if (!PROMPT_ID.test(id)) {
    return undefined;
  }
  try {
    return await readFile(fileURLToPath(new URL(`${id}.md`, directory)), "utf8");
  } catch {
    return undefined;
  }
}

export function loadBundledPersona(id: string): Promise<string | undefined> {
  return loadMarkdown(PERSONA_DIR, id);
}

export function loadBundledStepTask(id: string): Promise<string | undefined> {
  return loadMarkdown(STEP_TASK_DIR, id);
}

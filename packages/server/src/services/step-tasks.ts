import path from "node:path";
import { composeSkill } from "../domain/markdown/skill.ts";
import { SKILL_ID } from "../domain/rules/persona-notes.ts";
import type { ValidationResult } from "../domain/validation.ts";
import type { CatalogEntry } from "../domain/skills/catalog.ts";
import { stepTasksDir, userStepTasksDir } from "../paths.ts";
import type { ProjectPath } from "../paths.ts";
import { parseStepTask } from "../schemas/step-task.ts";
import type { ParsedStepTask } from "../schemas/step-task.ts";
import { readCachedText } from "../utils/text-file-cache.ts";
import {
  listBundledStepTaskIds,
  loadBundledStepTask,
  markdownIdsIn,
} from "./skill-assets.ts";

export interface StepTask extends ParsedStepTask {
  id: string;
  summary: string;
}

export interface StepTaskLibrary {
  byId: ReadonlyMap<string, StepTask>;
  composable: CatalogEntry[];
}

const ASSIGNMENT_HEADING = /^#\s+(?:Assignment:\s*)?(.+)$/m;

export function userStepTaskFilePath(id: string): string {
  return path.join(userStepTasksDir(), `${id}.md`);
}

export function projectStepTaskFilePath(projectPath: ProjectPath, id: string): string {
  return path.join(stepTasksDir(projectPath), `${id}.md`);
}

export function projectStepTaskAddendumPath(projectPath: ProjectPath, id: string): string {
  return path.join(stepTasksDir(projectPath), `${id}.project.md`);
}

export async function loadStepTask(
  projectPath: ProjectPath,
  id: string,
): Promise<ValidationResult<StepTask> | undefined> {
  if (!SKILL_ID.test(id)) {
    return undefined;
  }
  const [bundled, userOverride, projectOverride, projectAddendum] = await Promise.all([
    loadBundledStepTask(id),
    readCachedText(userStepTaskFilePath(id)),
    readCachedText(projectStepTaskFilePath(projectPath, id)),
    readCachedText(projectStepTaskAddendumPath(projectPath, id)),
  ]);
  const composed = composeSkill({
    base: userOverride ?? bundled,
    projectOverride,
    projectAddendum,
  });
  if (composed === undefined) {
    return undefined;
  }
  const parsed = parseStepTask(composed);
  return parsed.ok ? { ok: true, value: named(id, parsed.value) } : parsed;
}

export async function stepTaskLibrary(projectPath: ProjectPath): Promise<StepTaskLibrary> {
  const ids = await knownStepTaskIds(projectPath);
  const loaded = await Promise.all(
    ids.map(async (id) => [id, await loadStepTask(projectPath, id)] as const),
  );
  const byId = new Map<string, StepTask>();
  for (const [id, result] of loaded) {
    if (result?.ok) {
      byId.set(id, result.value);
    }
  }
  return {
    byId,
    composable: [...byId.values()]
      .filter((task) => !task.internal)
      .map(({ id, summary }) => ({ id, summary })),
  };
}

async function knownStepTaskIds(projectPath: ProjectPath): Promise<string[]> {
  const [bundled, user, project] = await Promise.all([
    listBundledStepTaskIds(),
    markdownIdsIn(userStepTasksDir()),
    markdownIdsIn(stepTasksDir(projectPath)),
  ]);
  return [...new Set([...bundled, ...user, ...project])];
}

function named(id: string, parsed: ParsedStepTask): StepTask {
  return { ...parsed, id, summary: parsed.summary ?? summaryOf(parsed.assignment, id) };
}

function summaryOf(assignment: string, id: string): string {
  return ASSIGNMENT_HEADING.exec(assignment)?.[1]?.trim() ?? id;
}

import path from "node:path";
import { ensureProjectDataDir, skillsDir, userSkillsDir } from "../paths.ts";
import type { ProjectPath } from "../paths.ts";
import { normalizeOrchestratorContext } from "../domain/rules/orchestrator-context.ts";
import { readOptionalText, writeTextFile } from "../utils/text-file.ts";

export function userSkillFilePath(skillId: string): string {
  return path.join(userSkillsDir(), `${skillId}.md`);
}

export function projectSkillAddendumPath(projectPath: ProjectPath, skillId: string): string {
  return path.join(skillsDir(projectPath), `${skillId}.project.md`);
}

export function personaNotesPath(projectPath: ProjectPath, skillId: string): string {
  return path.join(skillsDir(projectPath), `${skillId}.notes.md`);
}

export function orchestratorContextPath(projectPath: ProjectPath): string {
  return path.join(skillsDir(projectPath), "orchestrator.context.md");
}

export async function readOrchestratorContext(
  projectPath: ProjectPath,
): Promise<string | undefined> {
  const text = normalizeOrchestratorContext(
    (await readOptionalText(orchestratorContextPath(projectPath))) ?? "",
  );
  return text === "" ? undefined : text;
}

export async function writeOrchestratorContext(projectPath: ProjectPath, text: string): Promise<void> {
  await ensureProjectDataDir(projectPath);
  await writeTextFile(orchestratorContextPath(projectPath), text);
}

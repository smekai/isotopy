import { mkdir, rename, writeFile } from "node:fs/promises";
import { normalizeOrchestratorContext } from "../domain/rules/orchestrator-context.ts";
import { ensureProjectDataDir, skillsDir } from "../paths.ts";
import type { ProjectPath } from "../paths.ts";
import { readOptionalText } from "../utils/read-optional-text.ts";
import { orchestratorContextPath } from "./skills.ts";

export async function readOrchestratorContext(
  projectPath: ProjectPath,
): Promise<string | undefined> {
  const stored = await readOptionalText(orchestratorContextPath(projectPath));
  const text = normalizeOrchestratorContext(stored ?? "");
  return text === "" ? undefined : text;
}

export async function writeOrchestratorContext(
  projectPath: ProjectPath,
  text: string,
): Promise<void> {
  const file = orchestratorContextPath(projectPath);
  await ensureProjectDataDir(projectPath);
  await mkdir(skillsDir(projectPath), { recursive: true });
  const temporary = `${file}.tmp`;
  await writeFile(temporary, text === "" ? "" : `${text}\n`, "utf8");
  await rename(temporary, file);
}

import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { HOME_PROJECT_ID } from "@isotopy/core";
import type { Project } from "@isotopy/core";
import { readOptionalText } from "./utils/text-file.ts";

export const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

export interface ProjectPath {
  id: string;
  root: string;
  dataDir: string;
}

export function userIsotopyDir(): string {
  const override = process.env.ISOTOPY_USER_HOME;
  return override && override.trim() !== ""
    ? path.resolve(override.trim())
    : path.join(os.homedir(), ".isotopy");
}

export function projectsFilePath(): string {
  return path.join(userIsotopyDir(), "projects.json");
}

export function userSettingsPath(): string {
  return path.join(userIsotopyDir(), "settings.json");
}

export function serverLogPath(): string {
  return path.join(userIsotopyDir(), "logs", "server.log");
}

export function userSkillsDir(): string {
  return path.join(userIsotopyDir(), "skills");
}

export function homeProjectPaths(): ProjectPath {
  const override = process.env.ISOTOPY_HOME;
  const dataDir =
    override && override.trim() !== ""
      ? path.resolve(override.trim())
      : path.join(userIsotopyDir(), "home");
  return { id: HOME_PROJECT_ID, root: dataDir, dataDir };
}

export type ProjectLocation = Pick<Project, "id" | "root">;

export function projectPaths(project: ProjectLocation): ProjectPath {
  return project.id === HOME_PROJECT_ID
    ? homeProjectPaths()
    : { id: project.id, root: project.root, dataDir: path.join(project.root, ".isotopy") };
}

export function runsDir(projectPath: ProjectPath): string {
  return path.join(projectPath.dataDir, "runs");
}

export function skillsDir(projectPath: ProjectPath): string {
  return path.join(projectPath.dataDir, "skills");
}

export function agentsDir(projectPath: ProjectPath): string {
  return path.join(projectPath.dataDir, "agents");
}

export function stepsDir(projectPath: ProjectPath): string {
  return path.join(projectPath.dataDir, "steps");
}

export function packsFile(projectPath: ProjectPath): string {
  return path.join(projectPath.dataDir, "packs.json");
}

export function runWorkspaceDir(projectPath: ProjectPath, runId: string): string {
  return path.join(runsDir(projectPath), runId, "workspace");
}

export function toolCacheDir(projectPath: ProjectPath, workspacePath: string): string {
  return projectPath.id === HOME_PROJECT_ID
    ? path.join(workspacePath, ".isotopy", "cache")
    : path.join(projectPath.dataDir, "cache");
}

const DATA_DIR_GITIGNORE = [
  "*",
  "!/agents/",
  "!/agents/**",
  "!/steps/",
  "!/steps/**",
  "!/packs.json",
  "",
].join("\n");

const SELF_IGNORING_GITIGNORE = "*\n";

export async function ensureProjectDataDir(projectPath: ProjectPath): Promise<void> {
  await mkdir(projectPath.dataDir, { recursive: true });
  const file = path.join(projectPath.dataDir, ".gitignore");
  if (isIsotopyGitignore(await readOptionalText(file))) {
    await writeFile(file, DATA_DIR_GITIGNORE);
  }
}

function isIsotopyGitignore(existing: string | undefined): boolean {
  return existing === undefined || existing.replace(/\r\n/g, "\n") === SELF_IGNORING_GITIGNORE;
}

async function ensureRunWorkspace(projectPath: ProjectPath, runId: string): Promise<string> {
  const dir = runWorkspaceDir(projectPath, runId);
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function resolveWorkspace(
  projectPath: ProjectPath,
  runId: string,
): Promise<string> {
  return projectPath.id === HOME_PROJECT_ID ? ensureRunWorkspace(projectPath, runId) : projectPath.root;
}

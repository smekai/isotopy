import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { HOME_PROJECT_ID } from "@adhd/core";
import type { Project } from "@adhd/core";

export const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

export interface ProjectPath {
  id: string;
  root: string;
  dataDir: string;
}

export function userAdhdDir(): string {
  const override = process.env.ADHD_USER_HOME;
  return override && override.trim() !== ""
    ? path.resolve(override.trim())
    : path.join(os.homedir(), ".adhd");
}

export function projectsFilePath(): string {
  return path.join(userAdhdDir(), "projects.json");
}

export function userSettingsPath(): string {
  return path.join(userAdhdDir(), "settings.json");
}

export function userSkillsDir(): string {
  return path.join(userAdhdDir(), "skills");
}

export function homeProjectPaths(): ProjectPath {
  const override = process.env.ADHD_HOME;
  const dataDir =
    override && override.trim() !== ""
      ? path.resolve(override.trim())
      : path.join(userAdhdDir(), "home");
  return { id: HOME_PROJECT_ID, root: dataDir, dataDir };
}

export type ProjectLocation = Pick<Project, "id" | "root">;

export function projectPaths(project: ProjectLocation): ProjectPath {
  return project.id === HOME_PROJECT_ID
    ? homeProjectPaths()
    : { id: project.id, root: project.root, dataDir: path.join(project.root, ".adhd") };
}

export function runsDir(projectPath: ProjectPath): string {
  return path.join(projectPath.dataDir, "runs");
}

export function skillsDir(projectPath: ProjectPath): string {
  return path.join(projectPath.dataDir, "skills");
}

export function runWorkspaceDir(projectPath: ProjectPath, runId: string): string {
  return path.join(runsDir(projectPath), runId, "workspace");
}

const SELF_IGNORING_GITIGNORE = "*\n";

export async function ensureProjectDataDir(projectPath: ProjectPath): Promise<void> {
  await mkdir(projectPath.dataDir, { recursive: true });
  await writeFile(path.join(projectPath.dataDir, ".gitignore"), SELF_IGNORING_GITIGNORE, {
    flag: "wx",
  }).catch(() => undefined);
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

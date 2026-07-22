import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

export function adhdDir(): string {
  const override = process.env.ADHD_HOME;
  return override && override.trim() !== ""
    ? path.resolve(override.trim())
    : path.join(REPO_ROOT, ".adhd");
}

export function runsDir(): string {
  return path.join(adhdDir(), "runs");
}

export function runWorkspaceDir(runId: string): string {
  return path.join(runsDir(), runId, "workspace");
}

async function ensureRunWorkspace(runId: string): Promise<string> {
  const dir = runWorkspaceDir(runId);
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function resolveWorkspace(
  runId: string,
  workspaceDir?: string,
): Promise<string> {
  if (!workspaceDir || workspaceDir.trim() === "") {
    return ensureRunWorkspace(runId);
  }
  const resolved = path.resolve(workspaceDir.trim());
  let stats;
  try {
    stats = await stat(resolved);
  } catch {
    throw new Error(`Working directory does not exist: ${resolved}`);
  }
  if (!stats.isDirectory()) {
    throw new Error(`Working directory is not a directory: ${resolved}`);
  }
  return resolved;
}

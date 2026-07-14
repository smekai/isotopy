import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Anchored to the repo root, not process.cwd() — the dev server runs with
// cwd = packages/server (pnpm --filter), so cwd-relative paths would land there.
const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

export function runWorkspaceDir(runId: string): string {
  return path.join(REPO_ROOT, ".adhd", "runs", runId, "workspace");
}

async function ensureRunWorkspace(runId: string): Promise<string> {
  const dir = runWorkspaceDir(runId);
  await mkdir(dir, { recursive: true });
  return dir;
}

/**
 * Resolve the working directory for an engine run: a user-supplied directory
 * (must already exist) or a fresh scratch workspace under .adhd/runs/<runId>/.
 */
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

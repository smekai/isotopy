import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Anchored to the repo root, not process.cwd() — the dev server runs with
// cwd = packages/server (pnpm --filter), so cwd-relative paths would land there.
export const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

/**
 * Everything ADHD writes: run state, settings, personas. Defaults to `.adhd/`
 * beside the repo, and `ADHD_HOME` moves it elsewhere — which is what lets a
 * test point at a temp directory instead of the developer's real run history.
 *
 * Deliberately a function, not a constant: a constant would be frozen at import
 * time, so a test could only change it by controlling module load order.
 */
export function adhdDir(): string {
  const override = process.env.ADHD_HOME;
  return override && override.trim() !== ""
    ? path.resolve(override.trim())
    : path.join(REPO_ROOT, ".adhd");
}

/** One directory per run: state.json, events.jsonl, handoffs, workspace/. */
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

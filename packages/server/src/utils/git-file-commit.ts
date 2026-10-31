import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runSubprocess } from "../engines/subprocess.ts";
import type { SubprocessResult } from "../engines/subprocess.ts";
import { gitCommand } from "./git.ts";

const COMMIT_HOOK_TIMEOUT_MS = 120_000;

export interface FileCommit {
  root: string;
  relativePath: string;
  message: string;
}

export async function commitFileOnCurrentBranch({ root, relativePath, message }: FileCommit): Promise<void> {
  await requireGit(root, ["add", "--", relativePath]);
  if ((await git(root, ["diff", "--cached", "--quiet", "--", relativePath])).success) {
    return;
  }
  await requireGit(root, ["commit", "--message", message, "--only", "--", relativePath]);
}

export async function commitFileOnBranch(branch: string, commit: FileCommit): Promise<void> {
  const { root, relativePath, message } = commit;
  const ref = `refs/heads/${branch}`;
  const parent = (await requireGit(root, ["rev-parse", "--verify", ref])).stdout.trim();
  const blob = (await requireGit(root, ["hash-object", "-w", "--", relativePath])).stdout.trim();
  const index = path.join(os.tmpdir(), `isotopy-index-${randomUUID()}`);
  const env = { ...process.env, GIT_INDEX_FILE: index };
  try {
    await requireGit(root, ["read-tree", ref], env);
    await requireGit(root, ["update-index", "--add", "--cacheinfo", `100644,${blob},${relativePath}`], env);
    const tree = (await requireGit(root, ["write-tree"], env)).stdout.trim();
    const current = (await requireGit(root, ["rev-parse", `${ref}^{tree}`])).stdout.trim();
    if (tree === current) {
      return;
    }
    const created = (await requireGit(root, ["commit-tree", tree, "-p", parent, "-m", message])).stdout.trim();
    await requireGit(root, ["update-ref", ref, created, parent]);
  } finally {
    await rm(index, { force: true });
  }
}

function git(root: string, args: string[], env?: NodeJS.ProcessEnv): Promise<SubprocessResult> {
  return runSubprocess({ ...gitCommand(root, args), env, timeoutMs: COMMIT_HOOK_TIMEOUT_MS });
}

async function requireGit(root: string, args: string[], env?: NodeJS.ProcessEnv): Promise<SubprocessResult> {
  const result = await git(root, args, env);
  if (!result.success) {
    const detail = result.stderrTail.join("\n").trim() || result.errorMessage || "git gave no reason";
    throw new Error(`git ${args[0]} failed: ${detail}`);
  }
  return result;
}

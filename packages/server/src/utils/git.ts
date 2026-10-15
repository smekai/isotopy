import { stat } from "node:fs/promises";
import path from "node:path";
import type { SubprocessSpec } from "../engines/subprocess.ts";

const GIT_TIMEOUT_MS = 15_000;

export function gitCommand(cwd: string, args: string[], input?: string): SubprocessSpec {
  return { command: "git", args, cwd, input, timeoutMs: GIT_TIMEOUT_MS };
}

export async function isRepositoryRoot(directory: string): Promise<boolean> {
  try {
    await stat(path.join(directory, ".git"));
    return true;
  } catch {
    return false;
  }
}

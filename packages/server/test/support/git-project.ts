// AAAAA forbids inline logic in a test body, so the git plumbing a change-set
// test needs to arrange a repository lives here.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { runSubprocess } from "../../src/engines/subprocess.ts";

const GIT_TIMEOUT_MS = 15_000;

const IDENTITY = [
  "-c",
  "user.email=test@isotopy.invalid",
  "-c",
  "user.name=Isotopy Test",
  "-c",
  "commit.gpgsign=false",
];

async function git(cwd: string, args: string[]): Promise<void> {
  const result = await runSubprocess({
    command: "git",
    args: [...IDENTITY, ...args],
    cwd,
    timeoutMs: GIT_TIMEOUT_MS,
  });
  if (!result.success) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderrTail.join("\n")}`);
  }
}

export async function initGitRepository(cwd: string): Promise<void> {
  await git(cwd, ["init", "--initial-branch=main"]);
}

export async function commitEverything(cwd: string, message: string): Promise<void> {
  await git(cwd, ["add", "--all"]);
  await git(cwd, ["commit", "--no-verify", "-m", message]);
}

// An embedded repository is committed to its parent as a gitlink, which is what
// makes it report as a dirty *directory* once its own HEAD moves on.
export async function addDirtyEmbeddedRepository(cwd: string, name: string): Promise<void> {
  const embedded = path.join(cwd, name);
  await mkdir(embedded, { recursive: true });
  await initGitRepository(embedded);
  await writeFile(path.join(embedded, "inner.txt"), "first\n");
  await commitEverything(embedded, "inner");
  await commitEverything(cwd, `embed ${name}`);
  await writeFile(path.join(embedded, "inner.txt"), "second\n");
  await commitEverything(embedded, "inner again");
}

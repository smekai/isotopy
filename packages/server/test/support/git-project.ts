// AAAAA forbids inline logic in a test body, so the git plumbing a change-set
// test needs to arrange a repository lives here.
import { runSubprocess } from "../../src/engines/subprocess.ts";

const GIT_TIMEOUT_MS = 15_000;

const IDENTITY = [
  "-c",
  "user.email=test@adhd.invalid",
  "-c",
  "user.name=ADHD Test",
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

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

async function gitOutput(cwd: string, args: string[]): Promise<string> {
  const result = await runSubprocess({ command: "git", args, cwd, timeoutMs: GIT_TIMEOUT_MS });
  if (!result.success) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderrTail.join("\n")}`);
  }
  return result.stdout.trim();
}

// The local identity is for the commits Isotopy itself makes, such as a merge,
// which run without the -c flags above.
export async function initGitRepository(cwd: string): Promise<void> {
  await git(cwd, ["init", "--initial-branch=main"]);
  await git(cwd, ["config", "user.email", "test@isotopy.invalid"]);
  await git(cwd, ["config", "user.name", "Isotopy Test"]);
  await git(cwd, ["config", "commit.gpgsign", "false"]);
}

export async function commitFile(
  cwd: string,
  file: string,
  content: string,
  message: string,
): Promise<void> {
  await writeFile(path.join(cwd, file), content);
  await commitEverything(cwd, message);
}

export async function commitEverything(cwd: string, message: string): Promise<void> {
  await git(cwd, ["add", "--all"]);
  await git(cwd, ["commit", "--no-verify", "-m", message]);
}

export async function stageFile(cwd: string, file: string, content: string): Promise<void> {
  await mkdir(path.dirname(path.join(cwd, file)), { recursive: true });
  await writeFile(path.join(cwd, file), content);
  await git(cwd, ["add", "--", file]);
}

export async function createBranch(cwd: string, name: string): Promise<void> {
  await git(cwd, ["branch", name]);
}

export async function switchToNewBranch(cwd: string, name: string): Promise<void> {
  await git(cwd, ["switch", "-c", name]);
}

export function currentBranch(cwd: string): Promise<string> {
  return gitOutput(cwd, ["symbolic-ref", "--short", "HEAD"]);
}

export async function branchNames(cwd: string): Promise<string[]> {
  const listed = await gitOutput(cwd, ["branch", "--format=%(refname:short)"]);
  return listed
    .split("\n")
    .map((name) => name.trim())
    .sort();
}

export function fileAt(cwd: string, ref: string, file: string): Promise<string> {
  return gitOutput(cwd, ["show", `${ref}:${file}`]);
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

export async function untrackedPaths(cwd: string): Promise<string[]> {
  const result = await runSubprocess({
    command: "git",
    args: ["status", "--porcelain=v1", "-z", "--untracked-files=all"],
    cwd,
    timeoutMs: GIT_TIMEOUT_MS,
  });
  if (!result.success) {
    throw new Error(`git status failed: ${result.stderrTail.join("\n")}`);
  }
  return result.stdout
    .split("\0")
    .filter((entry) => entry.startsWith("?? "))
    .map((entry) => entry.slice(3))
    .sort();
}

export async function dirtyPaths(cwd: string): Promise<string[]> {
  const result = await runSubprocess({
    command: "git",
    args: ["status", "--porcelain=v1", "-z", "--untracked-files=all"],
    cwd,
    timeoutMs: GIT_TIMEOUT_MS,
  });
  if (!result.success) {
    throw new Error(`git status failed: ${result.stderrTail.join("\n")}`);
  }
  return result.stdout
    .split("\0")
    .filter(Boolean)
    .map((entry) => entry.slice(3))
    .sort();
}

// Git runs hooks through its own sh on Windows too; the mode is what lets it run elsewhere.
export async function installHook(cwd: string, name: string, script: string): Promise<void> {
  await writeFile(path.join(cwd, ".git", "hooks", name), `#!/bin/sh\n${script}\n`, { mode: 0o755 });
}

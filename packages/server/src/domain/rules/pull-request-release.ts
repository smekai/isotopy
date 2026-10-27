import type { RunBranch } from "@isotopy/core";
import type { PullRequestCheck } from "../../schemas/github-cli.ts";

export const GITHUB_CLI_STATES = ["missing", "signed_out", "ready"] as const;

export type GitHubCliState = (typeof GITHUB_CLI_STATES)[number];

export type ReleaseChannel = { kind: "pull_request" } | { kind: "local"; reason: string };

export function remoteRefusal(origin: string | undefined): string | undefined {
  if (origin === undefined) {
    return "the repository has no origin remote";
  }
  return isGitHubRemote(origin) ? undefined : "origin is not a GitHub remote";
}

export function cliRefusal(cli: GitHubCliState): string | undefined {
  switch (cli) {
    case "missing":
      return "the GitHub CLI (gh) is not installed";
    case "signed_out":
      return "the GitHub CLI (gh) is not signed in";
    case "ready":
      return undefined;
    default:
      return cli satisfies never;
  }
}

function isGitHubRemote(url: string): boolean {
  return /github\.com[:/]/i.test(url);
}

export function localMergeNotice(reason: string): string {
  return `Merging locally, not through a pull request: ${reason}`;
}

export function releasedStopReason(reason: string, branch: RunBranch, url: string): string {
  return `${reason} — merged ${branch.name} into ${branch.base} through ${url}`;
}

export const RELEASE_NEEDS_FIX =
  "CI failed on the initiative's pull request, so merging it again would fail the same way — " +
  "start a fix run with the failing checks first";

export type ChecksReport = { kind: "none" } | { kind: "reported"; checks: PullRequestCheck[] };

export type CiState = "pending" | "passed" | "failed";

const NO_CHECKS_GRACE_POLLS = 3;

export function ciStateOf(report: ChecksReport, poll: number): CiState {
  if (report.kind === "none") {
    return poll + 1 >= NO_CHECKS_GRACE_POLLS ? "passed" : "pending";
  }
  const buckets = report.checks.map((check) => check.bucket);
  if (buckets.some((bucket) => bucket === "fail" || bucket === "cancel")) {
    return "failed";
  }
  return buckets.some((bucket) => bucket === "pending") ? "pending" : "passed";
}

export function failingChecks(report: ChecksReport): PullRequestCheck[] {
  return report.kind === "none"
    ? []
    : report.checks.filter((check) => check.bucket === "fail" || check.bucket === "cancel");
}

export function actionsRunId(link: string): string | undefined {
  return /\/actions\/runs\/(\d+)/.exec(link)?.[1];
}

const PULL_REQUEST_TITLE_LIMIT = 72;

export function pullRequestTitle(goal: string): string {
  const firstLine = goal.trim().split(/\r?\n/)[0] ?? "";
  return firstLine.length <= PULL_REQUEST_TITLE_LIMIT
    ? firstLine
    : `${firstLine.slice(0, PULL_REQUEST_TITLE_LIMIT - 1).trimEnd()}…`;
}

export const CHANGE_CATEGORIES = [
  "Source",
  "Tests",
  "Task board",
  "Run evidence",
  "Docs",
  "Other",
] as const;

export type ChangeCategory = (typeof CHANGE_CATEGORIES)[number];

export interface CategoryCount {
  category: ChangeCategory;
  files: number;
  added: number;
  removed: number;
}

const SOURCE_EXTENSIONS = new Set([
  "ts",
  "tsx",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "vue",
  "svelte",
  "py",
  "go",
  "rs",
  "java",
  "kt",
  "swift",
  "cs",
  "rb",
  "php",
  "c",
  "h",
  "cpp",
  "css",
  "scss",
  "html",
  "sql",
  "sh",
  "ps1",
]);

const TEST_SEGMENTS = new Set(["test", "tests", "__tests__", "e2e", "spec"]);

export function changeCategory(file: string): ChangeCategory {
  const segments = file.split("/");
  const name = segments.at(-1) ?? file;
  const extension = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1).toLowerCase() : "";
  if (segments[0] === ".tasks") {
    return "Task board";
  }
  if (segments[0] === ".isotopy") {
    return "Run evidence";
  }
  if (
    segments.some((segment) => TEST_SEGMENTS.has(segment)) ||
    /\.(test|spec|comp|e2e)\./.test(name)
  ) {
    return "Tests";
  }
  if (extension === "md") {
    return "Docs";
  }
  return SOURCE_EXTENSIONS.has(extension) ? "Source" : "Other";
}

export function changeCounts(numstat: string): CategoryCount[] {
  const counts = new Map<ChangeCategory, CategoryCount>(
    CHANGE_CATEGORIES.map((category) => [category, { category, files: 0, added: 0, removed: 0 }]),
  );
  for (const line of numstat.split(/\r?\n/)) {
    const [added, removed, ...rest] = line.split("\t");
    const file = rest.join("\t");
    const count = file === "" ? undefined : counts.get(changeCategory(file));
    if (count === undefined) {
      continue;
    }
    count.files += 1;
    count.added += Number(added) || 0;
    count.removed += Number(removed) || 0;
  }
  return [...counts.values()];
}

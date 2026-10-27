import type { RunBranch } from "@isotopy/core";
import { formatValidationIssues } from "../domain/validation.ts";
import { changeCounts, cliRefusal, remoteRefusal } from "../domain/rules/pull-request-release.ts";
import type {
  CategoryCount,
  ChecksReport,
  GitHubCliState,
  ReleaseChannel,
} from "../domain/rules/pull-request-release.ts";
import { runSubprocess } from "../engines/subprocess.ts";
import type { SubprocessResult, SubprocessSpec } from "../engines/subprocess.ts";
import {
  MERGE_COMMIT_FIELDS,
  PULL_REQUEST_CHECK_FIELDS,
  PULL_REQUEST_VIEW_FIELDS,
  parseMergeCommit,
  parsePullRequestChecks,
  parsePullRequestView,
} from "../schemas/github-cli.ts";
import { gitCommand } from "../utils/git.ts";
import type { Logger } from "../utils/logger.ts";

export type SubprocessRunner = (spec: SubprocessSpec) => Promise<SubprocessResult>;

export interface PullRequestReleaseOptions {
  run?: SubprocessRunner;
  checkIntervalMs?: number;
  checkTimeoutMs?: number;
}

export type ReleaseStep<T> = { ok: true; value: T } | { ok: false; reason: string };

export interface PullRequestDraft {
  branch: RunBranch;
  title: string;
  bodyFile: string;
}

export interface MergedPullRequest {
  mergeCommit?: string;
  warnings: string[];
}

const GH_TIMEOUT_MS = 60_000;
const PUSH_TIMEOUT_MS = 180_000;
const FAILED_LOG_LINES = 60;
const DEFAULT_CHECK_INTERVAL_MS = 30_000;
const DEFAULT_CHECK_TIMEOUT_MS = 60 * 60_000;

export class PullRequestRelease {
  readonly checkIntervalMs: number;
  readonly checkTimeoutMs: number;
  private readonly run: SubprocessRunner;
  private readonly logger: Logger;

  constructor(logger: Logger, options: PullRequestReleaseOptions = {}) {
    this.logger = logger.child("PullRequestRelease");
    this.run = options.run ?? runSubprocess;
    this.checkIntervalMs = options.checkIntervalMs ?? DEFAULT_CHECK_INTERVAL_MS;
    this.checkTimeoutMs = options.checkTimeoutMs ?? DEFAULT_CHECK_TIMEOUT_MS;
  }

  get checkPolls(): number {
    return Math.max(1, Math.ceil(this.checkTimeoutMs / this.checkIntervalMs));
  }

  async channel(root: string): Promise<ReleaseChannel> {
    const origin = await this.git(root, ["remote", "get-url", "origin"]);
    const refusal =
      remoteRefusal(origin.success ? origin.stdout.trim() : undefined) ??
      cliRefusal(await this.cliState(root));
    return refusal === undefined ? { kind: "pull_request" } : { kind: "local", reason: refusal };
  }

  async push(root: string, branch: RunBranch): Promise<ReleaseStep<null>> {
    const pushed = await this.run({
      ...gitCommand(root, ["push", "-u", "origin", branch.name]),
      timeoutMs: PUSH_TIMEOUT_MS,
    });
    return pushed.success
      ? { ok: true, value: null }
      : { ok: false, reason: failure(`Could not push ${branch.name}`, pushed) };
  }

  async changeCounts(root: string, branch: RunBranch): Promise<CategoryCount[]> {
    const diff = await this.git(root, ["diff", "--numstat", `${branch.base}...${branch.name}`]);
    if (!diff.success) {
      this.logger.warn(failure(`Could not count the lines ${branch.name} changes`, diff));
    }
    return changeCounts(diff.success ? diff.stdout : "");
  }

  async openOrUpdate(root: string, draft: PullRequestDraft): Promise<ReleaseStep<string>> {
    const open = await this.openPullRequest(root, draft.branch.name);
    if (open !== undefined) {
      const edited = await this.gh(root, ["pr", "edit", open, "--body-file", draft.bodyFile]);
      if (!edited.success) {
        this.logger.warn(failure(`Could not update the description of ${open}`, edited));
      }
      return { ok: true, value: open };
    }
    const created = await this.gh(root, [
      "pr",
      "create",
      "--base",
      draft.branch.base,
      "--head",
      draft.branch.name,
      "--title",
      draft.title,
      "--body-file",
      draft.bodyFile,
    ]);
    const url = created.stdout.trim().split(/\r?\n/).at(-1)?.trim();
    return created.success && url
      ? { ok: true, value: url }
      : {
          ok: false,
          reason: failure(`Could not open a pull request for ${draft.branch.name}`, created),
        };
  }

  async checks(root: string, url: string): Promise<ReleaseStep<ChecksReport>> {
    const required = await this.readChecks(root, url, ["--required"]);
    if (required.ok || !/no required checks/i.test(required.reason)) {
      return required;
    }
    return this.readChecks(root, url, []);
  }

  async failedLog(root: string, runId: string): Promise<string | undefined> {
    const log = await this.gh(root, ["run", "view", runId, "--log-failed"]);
    if (!log.success) {
      return undefined;
    }
    const lines = log.stdout.trimEnd().split(/\r?\n/);
    return lines.slice(-FAILED_LOG_LINES).join("\n");
  }

  async merge(
    root: string,
    branch: RunBranch,
    url: string,
  ): Promise<ReleaseStep<MergedPullRequest>> {
    const merged = await this.gh(root, ["pr", "merge", url, "--merge"]);
    if (!merged.success) {
      return { ok: false, reason: failure(`Could not merge ${url}`, merged) };
    }
    const view = await this.gh(root, ["pr", "view", url, "--json", MERGE_COMMIT_FIELDS]);
    const warnings = await this.syncBase(root, branch);
    return {
      ok: true,
      value: { mergeCommit: view.success ? parseMergeCommit(view.stdout) : undefined, warnings },
    };
  }

  private async syncBase(root: string, branch: RunBranch): Promise<string[]> {
    const steps: Array<[string[], string]> = [
      [["switch", branch.base], `Merged, but could not switch back to ${branch.base}`],
      [
        ["pull", "--ff-only", "origin", branch.base],
        `Merged, but could not fast-forward ${branch.base}`,
      ],
      [["branch", "-d", branch.name], `Merged, but could not delete ${branch.name}`],
    ];
    const warnings: string[] = [];
    for (const [args, context] of steps) {
      const result = await this.git(root, args);
      if (!result.success) {
        warnings.push(failure(context, result));
        return warnings;
      }
    }
    return warnings;
  }

  private async readChecks(
    root: string,
    url: string,
    filter: string[],
  ): Promise<ReleaseStep<ChecksReport>> {
    const result = await this.gh(root, [
      "pr",
      "checks",
      url,
      ...filter,
      "--json",
      PULL_REQUEST_CHECK_FIELDS,
    ]);
    if (result.stdout.trim() !== "") {
      const parsed = parsePullRequestChecks(result.stdout);
      return parsed.ok
        ? { ok: true, value: { kind: "reported", checks: parsed.value } }
        : {
            ok: false,
            reason: `gh pr checks answered something unreadable: ${formatValidationIssues(parsed.issues)}`,
          };
    }
    const reason = failure(`Could not read the checks of ${url}`, result);
    return /no checks reported/i.test(reason) && !/no required checks/i.test(reason)
      ? { ok: true, value: { kind: "none" } }
      : { ok: false, reason };
  }

  private async openPullRequest(root: string, branch: string): Promise<string | undefined> {
    const view = await this.gh(root, ["pr", "view", branch, "--json", PULL_REQUEST_VIEW_FIELDS]);
    if (!view.success) {
      return undefined;
    }
    const parsed = parsePullRequestView(view.stdout);
    return parsed.ok && parsed.value.state === "OPEN" ? parsed.value.url : undefined;
  }

  private async cliState(root: string): Promise<GitHubCliState> {
    const status = await this.gh(root, ["auth", "status"]);
    if (status.success) {
      return "ready";
    }
    return status.exitCode === null && !status.timedOut ? "missing" : "signed_out";
  }

  private git(root: string, args: string[]): Promise<SubprocessResult> {
    return this.run(gitCommand(root, args));
  }

  private gh(root: string, args: string[]): Promise<SubprocessResult> {
    return this.run({ command: "gh", args, cwd: root, timeoutMs: GH_TIMEOUT_MS });
  }
}

function failure(context: string, result: SubprocessResult): string {
  const detail = result.stderrTail.join("\n").trim() || result.errorMessage || "no reason given";
  return `${context}: ${detail}`;
}

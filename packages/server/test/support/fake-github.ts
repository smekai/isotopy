// Stands in for `origin` and the `gh` CLI behind the pull-request release. Every
// git command nobody scripted runs for real against the test's repository, so a
// local switch or merge lands in git as it would in production; every `gh`
// command nobody scripted behaves as if `gh` were not installed.
import { readFile } from "node:fs/promises";
import { assert } from "vitest";
import { runSubprocess } from "../../src/engines/subprocess.ts";
import type { SubprocessResult, SubprocessSpec } from "../../src/engines/subprocess.ts";
import type { SubprocessRunner } from "../../src/services/pull-request-release.ts";

interface Script {
  prefix: string[];
  answers: SubprocessResult[];
}

export interface CheckFixture {
  name: string;
  bucket: "pass" | "fail" | "pending" | "skipping" | "cancel";
  link?: string;
}

export class FakeGitHub {
  readonly calls: string[][] = [];
  private readonly scripts: Script[] = [];

  readonly runner: SubprocessRunner = (spec) => this.run(spec);

  hasOrigin(url: string): FakeGitHub {
    return this.script(["git", "remote", "get-url", "origin"], succeeded(`${url}\n`));
  }

  isSignedIn(): FakeGitHub {
    return this.script(["gh", "auth", "status"], succeeded(""));
  }

  acceptsPush(): FakeGitHub {
    return this.script(["git", "push"], succeeded(""));
  }

  opensPullRequest(url: string): FakeGitHub {
    this.script(["gh", "pr", "view", "isotopy/"], failed("no pull requests found"));
    this.script(["gh", "pr", "edit"], succeeded(""));
    return this.script(["gh", "pr", "create"], succeeded(`${url}\n`));
  }

  reportsChecks(...polls: CheckFixture[][]): FakeGitHub {
    return this.script(
      ["gh", "pr", "checks"],
      ...polls.map((checks) =>
        succeeded(JSON.stringify(checks.map((check) => ({ link: "", ...check })))),
      ),
    );
  }

  printsFailedLog(log: string): FakeGitHub {
    return this.script(["gh", "run", "view"], succeeded(log));
  }

  mergesAs(mergeCommit: string): FakeGitHub {
    this.script(["gh", "pr", "merge"], succeeded(""));
    this.script(
      ["gh", "pr", "view", "https://"],
      succeeded(JSON.stringify({ mergeCommit: { oid: mergeCommit } })),
    );
    return this.script(["git", "pull"], succeeded(""));
  }

  ran(...prefix: string[]): boolean {
    return this.calls.some((call) => startsWith(call, prefix));
  }

  async pullRequestBody(): Promise<string> {
    const create = this.calls.find((call) => startsWith(call, ["gh", "pr", "create"]));
    const file = create?.[create.indexOf("--body-file") + 1];
    assert(file, "no pull request was created with a body file");
    return readFile(file, "utf8");
  }

  private script(prefix: string[], ...answers: SubprocessResult[]): FakeGitHub {
    this.scripts.push({ prefix, answers });
    return this;
  }

  private async run(spec: SubprocessSpec): Promise<SubprocessResult> {
    const call = [spec.command, ...(spec.args ?? [])];
    this.calls.push(call);
    const script = this.scripts.find((candidate) => startsWith(call, candidate.prefix));
    if (script === undefined) {
      return spec.command === "gh" ? notInstalled() : runSubprocess(spec);
    }
    // The last answer repeats, so a check that stays pending can be polled forever.
    const answer = script.answers.length > 1 ? script.answers.shift() : script.answers[0];
    assert(answer, `no answer scripted for ${call.join(" ")}`);
    return answer;
  }
}

function startsWith(call: string[], prefix: string[]): boolean {
  return prefix.every((part, index) => (call[index] ?? "").startsWith(part));
}

function result(overrides: Partial<SubprocessResult>): SubprocessResult {
  return {
    success: overrides.success ?? true,
    exitCode: overrides.exitCode === undefined ? 0 : overrides.exitCode,
    termSignal: null,
    timedOut: false,
    aborted: false,
    stdout: overrides.stdout ?? "",
    stderrTail: overrides.stderrTail ?? [],
    durationMs: 1,
    errorMessage: overrides.errorMessage,
  };
}

function succeeded(stdout: string): SubprocessResult {
  return result({ stdout });
}

function failed(stderr: string): SubprocessResult {
  return result({ success: false, exitCode: 1, stderrTail: [stderr] });
}

function notInstalled(): SubprocessResult {
  return result({
    success: false,
    exitCode: null,
    errorMessage: "Failed to start process: spawn gh ENOENT",
  });
}

import type { RunBranch, StopDecision } from "@isotopy/core";
import {
  initiativeBranchName,
  initiativeMergeMessage,
  isInitiativeBranch,
  leftOnInitiativeBranch,
  mergedStopReason,
} from "../domain/rules/initiative-branch.ts";
import { runSubprocess } from "../engines/subprocess.ts";
import type { SubprocessResult } from "../engines/subprocess.ts";
import { gitCommand, isRepositoryRoot } from "../utils/git.ts";
import type { Logger } from "../utils/logger.ts";

type BranchEntry = { kind: "branched"; branch: RunBranch } | { kind: "unbranched"; reason: string };

type MergeOutcome = { merged: true } | { merged: false; reason: string };

export type InitiativeEnding = { ended: true; reason: string } | { ended: false; refusal: string };

export interface InitiativeToEnd {
  id: string;
  goal: string;
  branch?: RunBranch;
}

export class InitiativeBranches {
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger.child("InitiativeBranches");
  }

  async enter(
    root: string,
    orchestrationId: string,
    existing: RunBranch | undefined,
  ): Promise<RunBranch | undefined> {
    const entry = await this.entryFor(root, orchestrationId, existing);
    if (entry.kind === "unbranched") {
      this.logger.info(`Initiative ${orchestrationId} works without a branch: ${entry.reason}`);
      return undefined;
    }
    return entry.branch;
  }

  async end(root: string, initiative: InitiativeToEnd, stop: StopDecision): Promise<InitiativeEnding> {
    const branch = initiative.branch;
    if (branch === undefined) {
      return { ended: true, reason: stop.reason };
    }
    if (stop.merge !== true) {
      await this.leave(root, initiative.id, branch);
      return { ended: true, reason: stop.reason };
    }
    const message = initiativeMergeMessage(branch, initiative.goal, stop.summary);
    const merged = await this.merge(root, branch, message);
    return merged.merged
      ? { ended: true, reason: mergedStopReason(stop.reason, branch) }
      : { ended: false, refusal: merged.reason };
  }

  private async entryFor(
    root: string,
    orchestrationId: string,
    existing: RunBranch | undefined,
  ): Promise<BranchEntry> {
    if (!(await isRepositoryRoot(root))) {
      return { kind: "unbranched", reason: "the project is not a git repository" };
    }
    if (existing !== undefined) {
      await this.checkOut(root, existing.name);
      return { kind: "branched", branch: existing };
    }
    if (!(await this.hasCommit(root))) {
      return { kind: "unbranched", reason: "the repository has no commit to branch from" };
    }
    const base = await this.currentBranch(root);
    if (base === undefined) {
      return { kind: "unbranched", reason: "HEAD is detached, so there is no branch to merge back into" };
    }
    if (isInitiativeBranch(base)) {
      throw new Error(leftOnInitiativeBranch(base));
    }
    const name = initiativeBranchName(orchestrationId);
    await this.require(root, ["switch", "-c", name], `Could not create the initiative's branch ${name}`);
    return { kind: "branched", branch: { name, base } };
  }

  private async merge(root: string, branch: RunBranch, message: string): Promise<MergeOutcome> {
    const switched = await this.git(root, ["switch", branch.base]);
    if (!switched.success) {
      return { merged: false, reason: failure(`Could not switch to ${branch.base}`, switched) };
    }
    const merged = await this.git(root, ["merge", "--no-ff", "-m", message, branch.name]);
    if (!merged.success) {
      await this.backOut(root, branch);
      return {
        merged: false,
        reason: failure(`Merging ${branch.name} into ${branch.base} failed`, merged),
      };
    }
    this.report(
      await this.git(root, ["branch", "-d", branch.name]),
      `Merged ${branch.name}, but could not delete it`,
    );
    return { merged: true };
  }

  private async leave(root: string, orchestrationId: string, branch: RunBranch): Promise<void> {
    this.report(
      await this.git(root, ["switch", branch.base]),
      `Initiative ${orchestrationId} stopped on ${branch.name}; could not switch back to ${branch.base}`,
    );
  }

  private async backOut(root: string, branch: RunBranch): Promise<void> {
    this.report(
      await this.git(root, ["merge", "--abort"]),
      `Could not abort the failed merge of ${branch.name}`,
    );
    this.report(
      await this.git(root, ["switch", branch.name]),
      `Could not return to ${branch.name} after the failed merge`,
    );
  }

  private async checkOut(root: string, name: string): Promise<void> {
    if ((await this.currentBranch(root)) === name) {
      return;
    }
    await this.require(root, ["switch", name], `Could not check out the initiative's branch ${name}`);
  }

  private async hasCommit(root: string): Promise<boolean> {
    return (await this.git(root, ["rev-parse", "--verify", "--quiet", "HEAD"])).success;
  }

  private async currentBranch(root: string): Promise<string | undefined> {
    const head = await this.git(root, ["symbolic-ref", "--quiet", "--short", "HEAD"]);
    return head.success ? head.stdout.trim() : undefined;
  }

  private async require(root: string, args: string[], context: string): Promise<void> {
    const result = await this.git(root, args);
    if (!result.success) {
      throw new Error(failure(context, result));
    }
  }

  private report(result: SubprocessResult, context: string): void {
    if (!result.success) {
      this.logger.warn(failure(context, result));
    }
  }

  private git(root: string, args: string[]): Promise<SubprocessResult> {
    return runSubprocess(gitCommand(root, args));
  }
}

function failure(context: string, result: SubprocessResult): string {
  const detail = result.stderrTail.join("\n").trim() || result.errorMessage || "git gave no reason";
  return `${context}: ${detail}`;
}

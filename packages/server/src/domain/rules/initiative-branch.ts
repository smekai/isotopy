import type { RunBranch } from "@isotopy/core";

const INITIATIVE_BRANCH_PREFIX = "isotopy/";

export function initiativeBranchName(orchestrationId: string): string {
  return `${INITIATIVE_BRANCH_PREFIX}${orchestrationId}`;
}

export function isInitiativeBranch(branch: string): boolean {
  return branch.startsWith(INITIATIVE_BRANCH_PREFIX);
}

export function leftOnInitiativeBranch(branch: string): string {
  return (
    `The project is checked out on ${branch}, which an earlier initiative left behind. ` +
    "Check out the branch this work should start from, then start it again"
  );
}

export function initiativeMergeMessage(branch: RunBranch, goal: string, summary?: string): string {
  return [`Merge ${branch.name} into ${branch.base}`, goal.trim(), summary?.trim()]
    .filter((part): part is string => part !== undefined && part !== "")
    .join("\n\n");
}

export function mergedStopReason(reason: string, branch: RunBranch): string {
  return `${reason} — merged ${branch.name} into ${branch.base}`;
}

export const NOTHING_TO_MERGE =
  "There is no branch to merge: this initiative works outside a git repository, on a detached " +
  "HEAD or before the first commit — stop without merge";

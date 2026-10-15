import type { RunBranch } from "@isotopy/core";

export function initiativeBranchName(orchestrationId: string): string {
  return `isotopy/${orchestrationId}`;
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

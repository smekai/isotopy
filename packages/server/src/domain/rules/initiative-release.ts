import type { RunBranch } from "@isotopy/core";

export const NO_ORIGIN = "the repository has no origin remote";

export function localMergeNotice(reason: string): string {
  return `Merging locally, not through a pull request: ${reason}`;
}

export function releasedStopReason(reason: string, branch: RunBranch, url: string): string {
  return `${reason} — merged ${branch.name} into ${branch.base} through ${url}`;
}

export const RELEASE_NEEDS_FIX =
  "CI failed on the initiative's pull request, so merging it again would fail the same way — " +
  "start a fix run with the failing checks first";

export const RELEASE_NOT_MERGED =
  "The Release Manager passed the release without a merge commit, so the pull request is not merged — " +
  "merge it, or say why it cannot be";

import { z } from "zod";
import { parseJson } from "../domain/validation.ts";
import type { ValidationResult } from "../domain/validation.ts";

export const CHECK_BUCKETS = ["pass", "fail", "pending", "skipping", "cancel"] as const;

export type CheckBucket = (typeof CHECK_BUCKETS)[number];

export const PULL_REQUEST_CHECK_FIELDS = "name,bucket,link";

const pullRequestCheckSchema = z.object({
  name: z.string().min(1),
  bucket: z.enum(CHECK_BUCKETS),
  link: z.string(),
});

export type PullRequestCheck = z.infer<typeof pullRequestCheckSchema>;

export const PULL_REQUEST_VIEW_FIELDS = "url,state";

const PULL_REQUEST_STATES = ["OPEN", "CLOSED", "MERGED"] as const;

const pullRequestViewSchema = z.object({
  url: z.string().min(1),
  state: z.enum(PULL_REQUEST_STATES),
});

export type PullRequestView = z.infer<typeof pullRequestViewSchema>;

export const MERGE_COMMIT_FIELDS = "mergeCommit";

const mergeCommitSchema = z.object({
  mergeCommit: z.object({ oid: z.string().min(1) }).nullable(),
});

export function parsePullRequestChecks(text: string): ValidationResult<PullRequestCheck[]> {
  return parseJson(z.array(pullRequestCheckSchema), text);
}

export function parsePullRequestView(text: string): ValidationResult<PullRequestView> {
  return parseJson(pullRequestViewSchema, text);
}

export function parseMergeCommit(text: string): string | undefined {
  const parsed = parseJson(mergeCommitSchema, text);
  return parsed.ok ? parsed.value.mergeCommit?.oid : undefined;
}

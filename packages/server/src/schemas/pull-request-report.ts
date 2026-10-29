import { runPullRequestSchema } from "@isotopy/core";
import type { RunPullRequest } from "@isotopy/core";
import type { ValidationResult } from "../domain/validation.ts";
import { extractFencedJson } from "./fenced-block.ts";

export const PULL_REQUEST_FENCE = "isotopy-pull-request";

export function extractPullRequestReport(output: string): ValidationResult<RunPullRequest> {
  return extractFencedJson(output, PULL_REQUEST_FENCE, runPullRequestSchema);
}

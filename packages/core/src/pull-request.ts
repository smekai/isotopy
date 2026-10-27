import { z } from "zod";
import { requiredText, requiredTexts } from "./schema.ts";

export const CI_RESULTS = ["passed", "failed", "timed_out"] as const;

export type CiResult = (typeof CI_RESULTS)[number];

export const runPullRequestSchema = z
  .object({
    url: requiredText,
    previewUrl: requiredText.optional(),
    ci: z.enum(CI_RESULTS).optional(),
    failingChecks: requiredTexts.optional(),
    mergeCommit: requiredText.optional(),
  })
  .strict();

export type RunPullRequest = z.infer<typeof runPullRequestSchema>;

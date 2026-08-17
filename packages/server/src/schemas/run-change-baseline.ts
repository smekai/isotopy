import { fileChangeSchema, requiredText, timestamp } from "@isotopy/core";
import { z } from "zod";
import { parseJson } from "../domain/validation.ts";
import type { ValidationResult } from "../domain/validation.ts";

export const RUN_CHANGE_BASELINE_VERSION = 1;

const fileStampSchema = z
  .object({
    path: requiredText,
    mtimeMs: z.number(),
    size: z.number().int().nonnegative(),
  })
  .strict();

const dirtyFileSchema = fileChangeSchema
  .extend({
    blob: requiredText.optional(),
  })
  .strict();

export type DirtyFile = z.infer<typeof dirtyFileSchema>;

export const runChangeBaselineSchema = z
  .object({
    version: z.literal(RUN_CHANGE_BASELINE_VERSION),
    capturedAt: timestamp,
    snapshot: z
      .object({
        files: z.array(fileStampSchema),
        truncated: z.boolean(),
      })
      .strict(),
    git: z
      .object({
        head: requiredText.optional(),
        dirty: z.array(dirtyFileSchema),
      })
      .strict()
      .optional(),
  })
  .strict();

export type RunChangeBaseline = z.infer<typeof runChangeBaselineSchema>;

export function parseRunChangeBaseline(
  content: string,
): ValidationResult<RunChangeBaseline> {
  return parseJson(runChangeBaselineSchema, content);
}

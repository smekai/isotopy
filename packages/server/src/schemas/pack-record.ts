import { z } from "zod";
import type { PackRecord } from "../domain/rules/pack-plan.ts";
import { parseJson } from "../domain/validation.ts";
import type { ValidationResult } from "../domain/validation.ts";

const text = z.string().min(1);

const packFileSchema = z
  .object({
    path: text,
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict();

const packRecordSchema = z
  .object({
    source: text,
    ref: text.optional(),
    path: text.optional(),
    commit: text.optional(),
    installedAt: text,
    files: z.array(packFileSchema),
  })
  .strict();

const packRecordsFileSchema = z
  .object({
    version: z.literal(1),
    packs: z.array(packRecordSchema),
  })
  .strict();

export interface PackRecordsFile {
  version: 1;
  packs: PackRecord[];
}

export function parsePackRecords(text: string): ValidationResult<PackRecordsFile> {
  return parseJson(packRecordsFileSchema, text);
}

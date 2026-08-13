import { releaseManifestSchema, type ReleaseManifest } from "@isotopy/core";
import { parseJson } from "../domain/validation.ts";
import type { ValidationResult } from "../domain/validation.ts";

const RELEASE_BLOCK = /```isotopy-release\s*([\s\S]*?)```/i;

export function extractReleaseManifest(output: string): ValidationResult<ReleaseManifest> {
  const block = RELEASE_BLOCK.exec(output)?.[1];
  if (!block) {
    return {
      ok: false,
      issues: [{ path: [], message: "Missing fenced isotopy-release JSON block" }],
    };
  }

  return parseJson(releaseManifestSchema, block);
}

import { releaseManifestSchema, type ReleaseManifest } from "@isotopy/core";
import type { ValidationResult } from "../domain/validation.ts";
import { extractFencedJson } from "./fenced-block.ts";

export function extractReleaseManifest(output: string): ValidationResult<ReleaseManifest> {
  return extractFencedJson(output, "isotopy-release", releaseManifestSchema);
}

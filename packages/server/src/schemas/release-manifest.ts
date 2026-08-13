import {
  extractModelProtocolBlock,
  MODEL_PROTOCOL_FENCE,
  releaseManifestSchema,
  type ReleaseManifest,
} from "@isotopy/core";
import { parseJson } from "../domain/validation.ts";
import type { ValidationResult } from "../domain/validation.ts";

export function extractReleaseManifest(output: string): ValidationResult<ReleaseManifest> {
  const block = extractModelProtocolBlock(output, MODEL_PROTOCOL_FENCE.release);
  if (!block) {
    return {
      ok: false,
      issues: [
        {
          path: [],
          message: `Missing fenced ${MODEL_PROTOCOL_FENCE.release} JSON block`,
        },
      ],
    };
  }

  return parseJson(releaseManifestSchema, block);
}

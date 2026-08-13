import {
  extractModelProtocolBlock,
  MODEL_PROTOCOL_FENCE,
  runArtifactsSchema,
  type RunArtifacts,
} from "@isotopy/core";
import { parseJson } from "../domain/validation.ts";
import type { ValidationResult } from "../domain/validation.ts";

export function extractRunArtifacts(
  output: string,
): ValidationResult<RunArtifacts> {
  const block = extractModelProtocolBlock(output, MODEL_PROTOCOL_FENCE.runArtifacts);
  if (!block) {
    return {
      ok: false,
      issues: [
        {
          path: [],
          message: `Missing fenced ${MODEL_PROTOCOL_FENCE.runArtifacts} JSON block`,
        },
      ],
    };
  }

  return parseJson(runArtifactsSchema, block);
}

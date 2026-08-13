import {
  extractModelProtocolBlock,
  milestonePlanSchema,
  MODEL_PROTOCOL_FENCE,
  type MilestonePlan,
} from "@isotopy/core";
import { parseJson } from "../domain/validation.ts";
import type { ValidationResult } from "../domain/validation.ts";

export function extractMilestonePlan(output: string): ValidationResult<MilestonePlan> {
  const block = extractModelProtocolBlock(
    output,
    MODEL_PROTOCOL_FENCE.milestonePlan,
  );
  if (!block) {
    return {
      ok: false,
      issues: [
        {
          path: [],
          message: `Missing fenced ${MODEL_PROTOCOL_FENCE.milestonePlan} JSON block`,
        },
      ],
    };
  }

  return parseJson(milestonePlanSchema, block);
}

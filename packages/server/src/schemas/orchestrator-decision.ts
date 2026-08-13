import {
  extractModelProtocolBlock,
  MODEL_PROTOCOL_FENCE,
  orchestratorDecisionSchema,
  type OrchestratorDecision,
} from "@isotopy/core";
import { parseJson } from "../domain/validation.ts";
import type { ValidationResult } from "../domain/validation.ts";

export function extractOrchestratorDecision(
  output: string,
): ValidationResult<OrchestratorDecision> {
  const block = extractModelProtocolBlock(
    output,
    MODEL_PROTOCOL_FENCE.orchestratorDecision,
  );
  if (!block) {
    return {
      ok: false,
      issues: [
        {
          path: [],
          message: `Missing fenced ${MODEL_PROTOCOL_FENCE.orchestratorDecision} JSON block`,
        },
      ],
    };
  }

  return parseJson(orchestratorDecisionSchema, block);
}

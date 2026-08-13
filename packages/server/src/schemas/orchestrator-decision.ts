import { orchestratorDecisionSchema, type OrchestratorDecision } from "@isotopy/core";
import { parseJson } from "../domain/validation.ts";
import type { ValidationResult } from "../domain/validation.ts";

const DECISION_BLOCK = /```isotopy-orchestrator-decision\s*([\s\S]*?)```/i;

export function extractOrchestratorDecision(
  output: string,
): ValidationResult<OrchestratorDecision> {
  const block = DECISION_BLOCK.exec(output)?.[1];
  if (!block) {
    return {
      ok: false,
      issues: [
        { path: [], message: "Missing fenced isotopy-orchestrator-decision JSON block" },
      ],
    };
  }

  return parseJson(orchestratorDecisionSchema, block);
}

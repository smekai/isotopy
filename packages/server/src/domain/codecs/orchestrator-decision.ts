import { orchestratorDecisionSchema, type OrchestratorDecision } from "@adhd/core";
import { parseJson } from "../validation.ts";
import type { ValidationResult } from "../validation.ts";

const DECISION_BLOCK = /```adhd-orchestrator-decision\s*([\s\S]*?)```/i;

export function extractOrchestratorDecision(
  output: string,
): ValidationResult<OrchestratorDecision> {
  const block = DECISION_BLOCK.exec(output)?.[1];
  if (!block) {
    return {
      ok: false,
      issues: [
        { path: [], message: "Missing fenced adhd-orchestrator-decision JSON block" },
      ],
    };
  }

  return parseJson(orchestratorDecisionSchema, block);
}

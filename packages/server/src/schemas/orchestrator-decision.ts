import { orchestratorDecisionSchema, type OrchestratorDecision } from "@isotopy/core";
import type { ValidationResult } from "../domain/validation.ts";
import { extractFencedJson } from "./fenced-block.ts";

export function extractOrchestratorDecision(
  output: string,
): ValidationResult<OrchestratorDecision> {
  return extractFencedJson(output, "isotopy-orchestrator-decision", orchestratorDecisionSchema);
}

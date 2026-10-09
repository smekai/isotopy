import { takeFencedBlock } from "./fenced-block.ts";

export const ORCHESTRATOR_CONTEXT_FENCE = "isotopy-orchestrator-context";

export function extractOrchestratorContext(output: string): string | undefined {
  return takeFencedBlock(output, ORCHESTRATOR_CONTEXT_FENCE).block;
}

import { runArtifactsSchema, type RunArtifacts } from "@isotopy/core";
import type { ValidationResult } from "../domain/validation.ts";
import { extractFencedJson } from "./fenced-block.ts";

export function extractRunArtifacts(output: string): ValidationResult<RunArtifacts> {
  return extractFencedJson(output, "isotopy-run-artifacts", runArtifactsSchema);
}

import { runArtifactsSchema, type RunArtifacts } from "@isotopy/core";
import { parseJson } from "../domain/validation.ts";
import type { ValidationResult } from "../domain/validation.ts";

const ARTIFACTS_BLOCK = /```isotopy-run-artifacts\s*([\s\S]*?)```/i;

export function extractRunArtifacts(
  output: string,
): ValidationResult<RunArtifacts> {
  const block = ARTIFACTS_BLOCK.exec(output)?.[1];
  if (!block) {
    return {
      ok: false,
      issues: [{ path: [], message: "Missing fenced isotopy-run-artifacts JSON block" }],
    };
  }

  return parseJson(runArtifactsSchema, block);
}

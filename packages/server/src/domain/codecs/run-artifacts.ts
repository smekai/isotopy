import { runArtifactsSchema, type RunArtifacts } from "@adhd/core";
import { parseJson } from "../validation.ts";
import type { ValidationResult } from "../validation.ts";

const ARTIFACTS_BLOCK = /```adhd-run-artifacts\s*([\s\S]*?)```/i;

export function extractRunArtifacts(
  output: string,
): ValidationResult<RunArtifacts> {
  const block = ARTIFACTS_BLOCK.exec(output)?.[1];
  if (!block) {
    return {
      ok: false,
      issues: [{ path: [], message: "Missing fenced adhd-run-artifacts JSON block" }],
    };
  }

  return parseJson(runArtifactsSchema, block);
}

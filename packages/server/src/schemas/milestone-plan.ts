import { milestonePlanSchema, type MilestonePlan } from "@isotopy/core";
import { parseJson } from "../domain/validation.ts";
import type { ValidationResult } from "../domain/validation.ts";

const PLAN_BLOCK = /```adhd-milestone-plan\s*([\s\S]*?)```/i;

export function extractMilestonePlan(output: string): ValidationResult<MilestonePlan> {
  const block = PLAN_BLOCK.exec(output)?.[1];
  if (!block) {
    return {
      ok: false,
      issues: [
        { path: [], message: "Missing fenced adhd-milestone-plan JSON block" },
      ],
    };
  }

  return parseJson(milestonePlanSchema, block);
}

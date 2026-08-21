import { milestonePlanSchema, type MilestonePlan } from "@isotopy/core";
import type { ValidationResult } from "../domain/validation.ts";
import { extractFencedJson } from "./fenced-block.ts";

export function extractMilestonePlan(output: string): ValidationResult<MilestonePlan> {
  return extractFencedJson(output, "isotopy-milestone-plan", milestonePlanSchema);
}

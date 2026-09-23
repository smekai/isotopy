import { milestonePlanSchema, type MilestonePlan } from "@isotopy/core";
import type { ValidationResult } from "../domain/validation.ts";
import { extractFencedJson } from "./fenced-block.ts";
import { refineTaskSectionText } from "./task-text.ts";

const writablePlanSchema = milestonePlanSchema.superRefine(refineTaskSectionText);

export function extractMilestonePlan(output: string): ValidationResult<MilestonePlan> {
  return extractFencedJson(output, "isotopy-milestone-plan", writablePlanSchema);
}

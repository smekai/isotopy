import { z } from "zod";
import { requiredText } from "@isotopy/core";
import { STAGE_WAIT_FENCE, WAIT_LIMITS } from "../domain/rules/stage-wait.ts";
import type { StageWait } from "../domain/rules/stage-wait.ts";
import { parseJson } from "../domain/validation.ts";
import type { ValidationResult } from "../domain/validation.ts";
import { BACKOFF_STRATEGIES, retryDelays } from "../utils/backoff.ts";
import { formatDuration, parseDuration } from "../utils/duration.ts";
import { takeFencedBlock } from "./fenced-block.ts";

const durationSchema = requiredText.transform((text, context) => {
  const ms = parseDuration(text);
  if (ms === undefined) {
    context.addIssue({ code: "custom", message: `"${text}" is not a duration like 30s, 5m or 2h` });
    return z.NEVER;
  }
  return ms;
});

function stageWaitSchema(minIntervalMs: number) {
  return z
    .object({
      until: requiredText,
      check: z
        .object({
          executable: requiredText,
          args: z.array(z.string()).default([]),
          timeout: durationSchema.optional(),
        })
        .strict()
        .optional(),
      attempts: z.number().int().min(1).max(WAIT_LIMITS.maxAttempts).default(1),
      every: durationSchema,
      backoff: z.enum(BACKOFF_STRATEGIES).default("fixed"),
      maxEvery: durationSchema.optional(),
      timeout: durationSchema.optional(),
    })
    .strict()
    .transform((block, context): StageWait => {
      if (Math.min(block.every, block.maxEvery ?? block.every) < minIntervalMs) {
        context.addIssue({
          code: "custom",
          path: ["every"],
          message: `checks may not run more often than every ${formatDuration(minIntervalMs)}`,
        });
      }
      const checkTimeoutMs = block.check?.timeout ?? WAIT_LIMITS.defaultCheckTimeoutMs;
      if (checkTimeoutMs > WAIT_LIMITS.maxCheckTimeoutMs) {
        context.addIssue({
          code: "custom",
          path: ["check", "timeout"],
          message: `a check may run for at most ${formatDuration(WAIT_LIMITS.maxCheckTimeoutMs)}`,
        });
      }
      const policy = {
        attempts: block.check === undefined ? 1 : block.attempts,
        everyMs: block.every,
        backoff: block.backoff,
        maxEveryMs: block.maxEvery,
        timeoutMs: Math.min(block.timeout ?? WAIT_LIMITS.maxTotalMs, WAIT_LIMITS.maxTotalMs),
      };
      if (retryDelays(policy).length === 0) {
        context.addIssue({
          code: "custom",
          path: ["timeout"],
          message: "the timeout ends before the first check",
        });
      }
      const check =
        block.check === undefined
          ? undefined
          : { executable: block.check.executable, args: block.check.args, timeoutMs: checkTimeoutMs };
      return { until: block.until, check, policy };
    });
}

export interface TakenStageWait {
  report: string;
  wait: ValidationResult<StageWait>;
}

export function takeStageWait(output: string, minIntervalMs: number): TakenStageWait | undefined {
  const taken = takeFencedBlock(output, STAGE_WAIT_FENCE);
  if (taken.block === undefined) {
    return undefined;
  }
  return { report: taken.report, wait: parseJson(stageWaitSchema(minIntervalMs), taken.block) };
}

import type { RetryPolicy } from "../../utils/backoff.ts";

export const STAGE_WAIT_FENCE = "isotopy-wait";

export const WAIT_LIMITS = {
  maxAttempts: 100,
  maxTotalMs: 48 * 3_600_000,
  maxWaitsPerStage: 12,
  defaultCheckTimeoutMs: 60_000,
  maxCheckTimeoutMs: 10 * 60_000,
} as const;

export interface StageWaitCheck {
  executable: string;
  args: string[];
  timeoutMs: number;
}

export interface StageWait {
  until: string;
  check?: StageWaitCheck;
  policy: RetryPolicy;
}

export interface WaitCheckResult {
  met: boolean;
  exitCode: number | null;
  outputTail: string;
}

export interface WaitSettlement {
  attemptsMade: number;
  plannedAttempts: number;
  last?: WaitCheckResult;
}

export function tooManyWaits(profession: string): string {
  return `${profession} asked to wait more than ${WAIT_LIMITS.maxWaitsPerStage} times in one stage`;
}

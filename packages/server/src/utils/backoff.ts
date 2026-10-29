export const BACKOFF_STRATEGIES = ["fixed", "linear", "exponential"] as const;

export type BackoffStrategy = (typeof BACKOFF_STRATEGIES)[number];

export interface RetryPolicy {
  attempts: number;
  everyMs: number;
  backoff: BackoffStrategy;
  maxEveryMs?: number;
  timeoutMs?: number;
}

function uncappedDelay(policy: RetryPolicy, attempt: number): number {
  switch (policy.backoff) {
    case "fixed":
      return policy.everyMs;
    case "linear":
      return policy.everyMs * (attempt + 1);
    case "exponential":
      return policy.everyMs * 2 ** attempt;
    default:
      return policy.backoff satisfies never;
  }
}

export function retryDelays(policy: RetryPolicy): number[] {
  const delays: number[] = [];
  let elapsed = 0;
  for (let attempt = 0; attempt < policy.attempts; attempt += 1) {
    const delay = Math.min(uncappedDelay(policy, attempt), policy.maxEveryMs ?? Infinity);
    if (policy.timeoutMs !== undefined && elapsed + delay > policy.timeoutMs) {
      break;
    }
    delays.push(delay);
    elapsed += delay;
  }
  return delays;
}

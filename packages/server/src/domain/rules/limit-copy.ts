import type { LimitChoice } from "@isotopy/core";

const CHOICE_REASONS: Record<LimitChoice, string> = {
  "retry-now": "you asked to retry now",
  "switch-tier": "you dropped to a cheaper preset",
  "switch-engine": "you switched the harness",
};

const RESET_REASON = "the plan limit reset";

export const LIMIT_LOG = {
  blocked: (profession: string, wait: string): string =>
    `${profession} hit a plan limit — waiting ${wait} for the reset`,
  resuming: (profession: string, choice: LimitChoice | undefined): string =>
    `${profession} is resuming — ${choice === undefined ? RESET_REASON : CHOICE_REASONS[choice]}`,
} as const;

export const LIMIT_ERRORS = {
  notBlocked: (stageId: string): string => `Stage ${stageId} is not waiting on a plan limit`,
  noDurableRun: (runId: string): string => `Run ${runId} has no durable run to resume`,
} as const;

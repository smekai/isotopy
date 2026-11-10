import { DEFAULT_LIMIT_WAIT_MS, ENGINES } from "@isotopy/core";
import type { RunLimit } from "@isotopy/core";

const FALLBACK_WAIT_MINUTES = DEFAULT_LIMIT_WAIT_MS / 60_000;

function headline(limit: RunLimit): string {
  const { label, loginCommand } = ENGINES[limit.engine];
  if (limit.cause === "signed-out") {
    return `${label} is signed out — run \`${loginCommand}\` in a terminal, then Retry now`;
  }
  return limit.attempt > 1
    ? `${label} hit its plan limit again (${limit.attempt} times on this step)`
    : `${label} hit its plan limit`;
}

export const LIMIT_COPY = {
  headline,
  subtitle: (stageLabel: string): string =>
    `${stageLabel} is paused — the run resumes on its own, nothing is lost.`,
  countdownSuffix: (resetLabel: string): string => `until it resets at ${resetLabel}`,
  noResetTime: `The harness printed no reset time — retrying in ${FALLBACK_WAIT_MINUTES} minutes.`,
  switchModelHeading: "SWITCH THE MODEL — RESUMES THIS STEP, KEEPS FINISHED WORK",
  switchHarnessHeading: "SWITCH THE HARNESS — A DIFFERENT PLAN, A DIFFERENT LIMIT",
  otherHeading: "OR",
  connection: "Connection & API key",
  retryNow: "Retry now",
  keepWaiting: "Keep waiting",
  enableNotifications: "Enable notifications",
  abort: "Abort the run",
  notificationTitle: "⏸ Limit — Isotopy",
  notificationBody: (resetLabel: string | undefined): string =>
    resetLabel === undefined ? "Waiting for the reset." : `Waiting until ${resetLabel}.`,
} as const;

export const APP_TITLE = "Isotopy";

import { formatDuration } from "../../utils/duration.ts";
import { retryDelays } from "../../utils/backoff.ts";
import { STAGE_WAIT_FENCE } from "../rules/stage-wait.ts";
import type { StageWait, WaitSettlement } from "../rules/stage-wait.ts";
import { markdownBlocks, structuralText } from "./format.ts";

export function buildWaitRule(minIntervalMs: number): string {
  return [
    "When the next step can only happen later — CI finishing, a deployment going live, a job",
    "someone else runs — do not sleep or poll in this session. End your turn with this block",
    "instead of a verdict, and Isotopy wakes you here when the wait is over:",
    "",
    `\`\`\`${STAGE_WAIT_FENCE}`,
    '{ "until": "CI on the pull request has settled",',
    '  "check": { "executable": "gh", "args": ["pr", "checks", "7"] },',
    '  "attempts": 10, "every": "5m", "backoff": "exponential", "maxEvery": "30m", "timeout": "6h" }',
    "```",
    "",
    "`check` runs in the project root as an executable and an argument array, with no shell, so",
    "pick a command that exists on this machine. Exit 0 ends the wait early; any other exit is one",
    "more attempt. Without `check` you are woken once, after `every`. `backoff` is `fixed`,",
    "`linear` or `exponential`; durations read like `30s`, `5m`, `2h`, and checks run no more often",
    `than every ${formatDuration(minIntervalMs)}. When you are woken you get the last check's output:`,
    "finish the stage as it asks, or wait again.",
  ].join("\n");
}

export function describeWait(wait: StageWait): string {
  const delays = retryDelays(wait.policy);
  const first = formatDuration(delays[0] ?? wait.policy.everyMs);
  const checks =
    wait.check === undefined
      ? `waking in ${first}`
      : `up to ${delays.length} check${delays.length === 1 ? "" : "s"}, the first in ${first}`;
  return `${structuralText(wait.until)} — ${checks}`;
}

function settlementLine(wait: StageWait, settlement: WaitSettlement): string {
  if (wait.check === undefined) {
    return `You asked to be woken after ${formatDuration(wait.policy.everyMs)}; that time has passed.`;
  }
  const exit = settlement.last?.exitCode ?? "none";
  return settlement.last?.met === true
    ? `The check succeeded on attempt ${settlement.attemptsMade} of ${settlement.plannedAttempts}.`
    : `The wait gave up: no check succeeded in ${settlement.attemptsMade} attempts (last exit code ${exit}).`;
}

export function buildWaitReport(wait: StageWait, settlement: WaitSettlement): string {
  const tail = settlement.last?.outputTail.trim();
  return markdownBlocks([
    `# The wait is over: ${structuralText(wait.until)}`,
    settlementLine(wait, settlement),
    tail ? `## Last check output\n\n\`\`\`text\n${tail}\n\`\`\`` : undefined,
    "Continue the stage from here.",
  ]);
}

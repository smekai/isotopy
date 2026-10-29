import { expect, test } from "vitest";
import { takeStageWait } from "../src/schemas/stage-wait.ts";

const MINUTE = 60_000;

function block(wait: Record<string, unknown>): string {
  return `Waiting.\n\n\`\`\`isotopy-wait\n${JSON.stringify({ until: "CI settled", ...wait })}\n\`\`\``;
}

test("a wait reads its durations and keeps the check's arguments as an array", () => {
  const taken = takeStageWait(
    block({ check: { executable: "gh", args: ["pr", "checks", "7"] }, attempts: 4, every: "5m", maxEvery: "1h" }),
    30_000,
  );

  expect(taken?.report).toBe("Waiting.");
  expect(taken?.wait).toEqual({
    ok: true,
    value: {
      until: "CI settled",
      check: { executable: "gh", args: ["pr", "checks", "7"], timeoutMs: MINUTE },
      policy: { attempts: 4, everyMs: 5 * MINUTE, backoff: "fixed", maxEveryMs: 60 * MINUTE, timeoutMs: 48 * 60 * MINUTE },
    },
  });
});

test("a wait that would check more often than the minimum interval is refused", () => {
  const taken = takeStageWait(block({ check: { executable: "gh" }, attempts: 3, every: "5s" }), 30_000);

  expect(taken?.wait.ok).toBe(false);
});

test("a wait without a check is woken once, whatever attempts it names", () => {
  const taken = takeStageWait(block({ attempts: 9, every: "10m" }), 30_000);

  expect(taken?.wait.ok && taken.wait.value.policy.attempts).toBe(1);
});

test("a check allowed to run longer than the cap is refused", () => {
  const taken = takeStageWait(block({ check: { executable: "gh", timeout: "1h" }, every: "5m" }), 30_000);

  expect(taken?.wait.ok).toBe(false);
});

test("output with no wait block is not a wait", () => {
  expect(takeStageWait("Done.\n\nVERDICT: PASS", 30_000)).toBeUndefined();
});

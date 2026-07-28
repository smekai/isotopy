// The run's spend is derived from its stages, never stored — a stored total
// drifts the moment a stage is restarted. And the display rule lives here
// because the engines differ: Claude Code reports dollars, Codex reports only
// tokens, Cursor reports neither.
import { expect, test } from "vitest";
import { addUsage, formatUsage, runUsage } from "../src/runs.ts";
import type { RunState, StageState, StageUsage } from "../src/runs.ts";

function stageWith(id: string, usage?: StageUsage): StageState {
  return {
    id,
    label: id,
    status: "passed",
    logs: [],
    ...(usage ? { usage } : {}),
  };
}

function runWith(stages: StageState[]): RunState {
  return {
    id: "run-1",
    number: 1,
    projectId: "home",
    pipelineId: "pm-dev-test",
    pipelineName: "PM + Dev + Test",
    status: "completed",
    stages,
    messages: [],
    createdAt: "2026-07-28T10:00:00.000Z",
  };
}

test("a stage's turns add up rather than replacing each other", () => {
  const first = addUsage(undefined, { costUsd: 0.02, turns: 1, tokensIn: 100 });
  const second = addUsage(first, { costUsd: 0.03, turns: 2, tokensIn: 250 });

  expect(second).toEqual({ costUsd: 0.05, turns: 3, tokensIn: 350 });
});

test("a field the second turn does not report keeps the first turn's value", () => {
  expect(addUsage({ costUsd: 0.02, turns: 1 }, { durationMs: 900 })).toEqual({
    costUsd: 0.02,
    turns: 1,
    durationMs: 900,
  });
});

test("the run total sums every stage that spent anything", () => {
  const run = runWith([
    stageWith("intake", { costUsd: 0.01, turns: 1 }),
    stageWith("implementation", { costUsd: 0.24, turns: 4 }),
    stageWith("test"),
  ]);

  expect(runUsage(run)).toEqual({ costUsd: 0.25, turns: 5 });
});

test("a run whose stages spent nothing totals to nothing, not zero", () => {
  expect(runUsage(runWith([stageWith("solo")]))).toEqual({});
  expect(formatUsage({})).toBeUndefined();
});

test("dollars show cents, and sub-cent spend keeps four decimals", () => {
  expect(formatUsage({ costUsd: 0.1423 })).toBe("$0.14");
  expect(formatUsage({ costUsd: 0.0042 })).toBe("$0.0042");
});

test("an engine that counts only tokens reports tokens", () => {
  expect(formatUsage({ tokensIn: 12_300, tokensOut: 4100 })).toBe("12.3k in · 4.1k out");
  expect(formatUsage({ tokensIn: 840, tokensOut: 120 })).toBe("840 in · 120 out");
});

test("dollars win over tokens when an engine reports both", () => {
  expect(formatUsage({ costUsd: 0.5, tokensIn: 12_300, tokensOut: 4100 })).toBe("$0.50");
});

import { expect, test } from "vitest";
import type { RunCloseoutRecord, RunState } from "@isotopy/core";
import { shouldReleaseSourceTasks } from "../../src/services/run/source-task-claim.ts";

test("a completed run does not release its source tasks", () => {
  expect(shouldReleaseSourceTasks(run({ status: "completed" }))).toBe(false);
});

test("a cancelled run without closeout releases its source tasks", () => {
  expect(shouldReleaseSourceTasks(run({ status: "cancelled" }))).toBe(true);
});

test("a failed run that already wrote a closeout leaves the board alone", () => {
  expect(
    shouldReleaseSourceTasks(run({ status: "failed", closeout: CLOSEOUT })),
  ).toBe(false);
});

test("a run with no source tasks never releases", () => {
  expect(shouldReleaseSourceTasks(run({ sourceTaskIds: undefined }))).toBe(false);
});

const CLOSEOUT = {
  report: {
    summary: "done",
    outcome: "delivered",
    findings: [],
    tasks: [],
    completedTaskIds: [],
    unresolvedTaskIds: [],
  },
  createdTasks: [],
  cleanup: { removed: [], rejected: [] },
  validationErrors: [],
  completedAt: "2026-09-25T00:00:00.000Z",
} as RunCloseoutRecord;

function run(overrides: Partial<RunState>): RunState {
  return {
    id: "run-1",
    number: 1,
    projectId: "p",
    pipelineId: "pm-dev-test",
    pipelineName: "Developer + Tester",
    status: "cancelled",
    stages: [],
    messages: [],
    createdAt: "2026-09-25T00:00:00.000Z",
    sourceTaskIds: ["TASK-001"],
    ...overrides,
  };
}

import { expect, test } from "vitest";
import type { RunCloseoutRecord, RunState } from "@isotopy/core";
import { sourceTasksToRelease } from "../../src/domain/rules/run-lifecycle.ts";

test("a completed run leaves its source tasks to closeout", () => {
  expect(sourceTasksToRelease(run({ status: "completed" }))).toEqual([]);
});

test("a cancelled run without a closeout releases its source tasks", () => {
  expect(sourceTasksToRelease(run({ status: "cancelled" }))).toEqual(["TASK-001"]);
});

test("a failed run that already wrote a closeout leaves the board as closeout left it", () => {
  expect(sourceTasksToRelease(run({ status: "failed", closeout: CLOSEOUT }))).toEqual([]);
});

const CLOSEOUT: RunCloseoutRecord = {
  report: {
    summary: "done",
    deliveredScope: [],
    decisions: [],
    knowledge: [],
    findings: [],
    tasks: [],
    completedTaskIds: [],
    unresolvedTaskIds: [],
    cleanup: [],
  },
  createdTasks: [],
  cleanup: { removed: [], rejected: [] },
  validationErrors: [],
  completedAt: "2026-09-25T00:00:00.000Z",
};

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

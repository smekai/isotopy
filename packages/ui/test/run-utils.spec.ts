// Unit spec: which stage a failed run resumes from is easy to get subtly wrong
// (TASK-060 shipped a Restart button that actually resumed), and the scratch
// check has to hold on both path separators.
import { describe, expect, test } from "vitest";
import type { RunState, StageState, StageStatus } from "@adhd/core";
import { firstEnabledStageId, isScratchWorkspace, resumeStageId } from "../src/run-utils";

function stage(id: string, status: StageStatus): StageState {
  return { id, label: id, status, logs: [] };
}

function run(stages: StageState[], disabledStages?: string[]): RunState {
  return {
    id: "r1",
    number: 1,
    pipelineId: "sequential",
    pipelineName: "Sequential lifecycle",
    status: "failed",
    stages,
    createdAt: "2026-07-21T10:00:00.000Z",
    ...(disabledStages ? { disabledStages } : {}),
  };
}

describe("resumeStageId", () => {
  test("resumes at the stage that failed", () => {
    expect(
      resumeStageId(run([stage("intake", "passed"), stage("design", "failed")])),
    ).toBe("design");
  });

  test("after an abort, resumes at the first stage the abort skipped", () => {
    expect(
      resumeStageId(
        run([stage("intake", "passed"), stage("design", "skipped"), stage("test", "skipped")]),
      ),
    ).toBe("design");
  });

  test("ignores stages that were switched off for the run", () => {
    // A disabled stage was configuration, not a casualty of the abort.
    expect(
      resumeStageId(
        run(
          [stage("intake", "passed"), stage("design", "skipped"), stage("test", "skipped")],
          ["design"],
        ),
      ),
    ).toBe("test");
  });

  test("prefers the failed stage over an earlier skipped one", () => {
    expect(
      resumeStageId(
        run([stage("intake", "skipped"), stage("design", "failed")], ["intake"]),
      ),
    ).toBe("design");
  });

  test("returns null when there is nothing to resume", () => {
    expect(resumeStageId(run([stage("intake", "passed")]))).toBeNull();
  });
});

describe("firstEnabledStageId", () => {
  test("is the first stage the run actually executes", () => {
    expect(
      firstEnabledStageId(run([stage("intake", "passed"), stage("design", "passed")])),
    ).toBe("intake");
  });

  test("skips past stages disabled for the run", () => {
    expect(
      firstEnabledStageId(
        run([stage("intake", "skipped"), stage("design", "passed")], ["intake"]),
      ),
    ).toBe("design");
  });

  test("returns null when every stage is disabled", () => {
    expect(firstEnabledStageId(run([stage("intake", "skipped")], ["intake"]))).toBeNull();
  });
});

describe("isScratchWorkspace", () => {
  test("recognises a scratch path with Windows separators", () => {
    expect(isScratchWorkspace("C:\\dev\\adhd\\.adhd\\runs\\ab12\\workspace")).toBe(true);
  });

  test("recognises a scratch path with POSIX separators", () => {
    expect(isScratchWorkspace("/home/me/adhd/.adhd/runs/ab12/workspace")).toBe(true);
  });

  test("a directory the user chose is not scratch", () => {
    expect(isScratchWorkspace("C:\\projects\\my-app")).toBe(false);
    expect(isScratchWorkspace("/home/me/projects/my-app")).toBe(false);
  });

  test("an absent workspace is not scratch", () => {
    expect(isScratchWorkspace(undefined)).toBe(false);
  });
});

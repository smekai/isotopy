// Unit spec: which stage a failed run resumes from is easy to get subtly wrong
// (TASK-060 shipped a Restart button that actually resumed), and the scratch
// check has to hold on both path separators.
import { describe, expect, test } from "vitest";
import type { RunState, StageState } from "@adhd/core";
import {
  childPath,
  isScratchWorkspace,
  resumeStageId,
  stagePresentation,
} from "../../src/run-utils";
import { run as runFixture, stage } from "../support/run-fixtures";

/** Every case here is about resuming, so the run is always a failed one. */
function run(stages: StageState[]): RunState {
  return runFixture(stages, "failed");
}

describe("resumeStageId", () => {
  test("resumes at the stage that failed", () => {
    expect(
      resumeStageId(run([stage("implementation", "passed"), stage("test", "failed")])),
    ).toBe("test");
  });

  test("after an abort, resumes at the first stage the abort skipped", () => {
    expect(
      resumeStageId(run([stage("implementation", "passed"), stage("test", "skipped")])),
    ).toBe("test");
  });

  test("prefers the failed stage over an earlier skipped one", () => {
    expect(
      resumeStageId(run([stage("implementation", "skipped"), stage("test", "failed")])),
    ).toBe("test");
  });

  test("returns null when there is nothing to resume", () => {
    expect(resumeStageId(run([stage("implementation", "passed")]))).toBeNull();
  });
});

describe("isScratchWorkspace", () => {
  test("recognises a scratch path with Windows separators", () => {
    expect(isScratchWorkspace("C:\\dev\\adhd\\.adhd\\runs\\ab12\\workspace")).toBe(true);
  });

  test("recognises a scratch path with POSIX separators", () => {
    expect(isScratchWorkspace("/home/me/adhd/.adhd/runs/ab12/workspace")).toBe(true);
  });

  test("recognises the home project's scratch path, which has no .adhd/runs segment", () => {
    expect(isScratchWorkspace("C:\\Users\\me\\.adhd\\home\\runs\\ab12\\workspace")).toBe(true);
  });

  test("a project root is not scratch", () => {
    expect(isScratchWorkspace("C:\\projects\\my-app")).toBe(false);
    expect(isScratchWorkspace("/home/me/projects/my-app")).toBe(false);
  });

});

describe("stagePresentation", () => {
  test("a quality stage that reported FAIL reads as needs attention, not failure", () => {
    expect(stagePresentation({ status: "failed", verdict: "FAIL" })).toBe(
      "needs_attention",
    );
  });

  test("a stage that failed without a verdict stays a failure", () => {
    expect(stagePresentation({ status: "failed" })).toBe("failed");
  });

  test("a SKIP verdict keeps the skipped status it was recorded with", () => {
    expect(stagePresentation({ status: "skipped", verdict: "SKIP" })).toBe("skipped");
  });

  test("every other status passes through untouched", () => {
    expect(stagePresentation({ status: "passed", verdict: "PASS" })).toBe("passed");
    expect(stagePresentation({ status: "running" })).toBe("running");
    expect(stagePresentation({ status: "awaiting" })).toBe("awaiting");
  });
});

describe("childPath", () => {
  test("keeps Windows separators when the base has them", () => {
    expect(childPath("C:\\projects\\my-app\\.adhd", "runs/ab12")).toBe(
      "C:\\projects\\my-app\\.adhd\\runs\\ab12",
    );
  });

  test("keeps POSIX separators when the base has them", () => {
    expect(childPath("/home/me/my-app/.adhd", "runs/ab12")).toBe(
      "/home/me/my-app/.adhd/runs/ab12",
    );
  });
});

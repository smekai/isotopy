// Unit spec: which stage a failed run resumes from is easy to get subtly wrong
// (TASK-060 shipped a Restart button that actually resumed), and the scratch
// check has to hold on both path separators.
import { describe, expect, test } from "vitest";
import { HOME_PROJECT_ID } from "@adhd/core";
import type { RunState, StageState, StageStatus } from "@adhd/core";
import { childPath, firstStageId, isScratchWorkspace, resumeStageId } from "../src/run-utils";

function stage(id: string, status: StageStatus): StageState {
  return { id, label: id, status, logs: [] };
}

function run(stages: StageState[]): RunState {
  return {
    id: "r1",
    number: 1,
    projectId: HOME_PROJECT_ID,
    pipelineId: "dev-test",
    pipelineName: "Developer + Tester",
    status: "failed",
    stages,
    messages: [],
    createdAt: "2026-07-21T10:00:00.000Z",
  };
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

describe("firstStageId", () => {
  test("is the first stage of the run", () => {
    expect(
      firstStageId(run([stage("implementation", "passed"), stage("test", "passed")])),
    ).toBe("implementation");
  });

  test("returns null when there are no stages", () => {
    expect(firstStageId(run([]))).toBeNull();
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

  test("an absent workspace is not scratch", () => {
    expect(isScratchWorkspace(undefined)).toBe(false);
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

import { describe, expect, test } from "vitest";
import { createInitialRunState, isTerminalRunStatus } from "../src/runs.ts";
import type { PipelineDefinition } from "../src/pipelines.ts";

describe("isTerminalRunStatus", () => {
  test("treats needs attention as terminal", () => {
    expect(isTerminalRunStatus("needs_attention")).toBe(true);
  });
});

describe("createInitialRunState", () => {
  test("carries each stage's model tier onto its state, which is what resolution reads", () => {
    const run = createInitialRunState({
      runId: "r1",
      number: 1,
      projectId: "home",
      pipeline: pipeline([
        { id: "design", label: "Architect", modelTier: "deep" },
        { id: "build", label: "Developer" },
      ]),
    });

    expect(run.stages.map((stage) => stage.modelTier)).toEqual(["deep", undefined]);
  });
});

function pipeline(stages: PipelineDefinition["groups"][number]["stages"]): PipelineDefinition {
  return { id: "team-abc", name: "Composed", description: "A composed team", groups: [{ stages }] };
}

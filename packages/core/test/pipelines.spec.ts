// Unit spec: `pipelineUsesEngine` is the switch that decides whether a run
// validates the harness, allocates a workspace, and spends money. Its whole
// point is being derived from the stage model rather than a hardcoded list of
// pipeline ids, so a new pipeline must classify itself correctly.
import { describe, expect, test } from "vitest";
import type { PipelineDefinition } from "../src/pipelines.ts";
import {
  DEMO_PIPELINES,
  DEV_TEST_PIPELINE,
  GATED_DEV_TEST_PIPELINE,
  ONE_BOX_PIPELINE,
  findPipeline,
  flattenPipelineStages,
  pipelineUsesEngine,
  pipelineUsesEngineById,
} from "../src/pipelines.ts";

describe("flattenPipelineStages", () => {
  test("returns stages in run order across groups", () => {
    const pipeline: PipelineDefinition = {
      id: "multi",
      name: "Multi",
      description: "",
      groups: [
        { stages: [{ id: "a", label: "A" }] },
        { stages: [{ id: "b", label: "B" }, { id: "c", label: "C" }] },
      ],
    };

    expect(flattenPipelineStages(pipeline).map((stage) => stage.id)).toEqual(["a", "b", "c"]);
  });

  test("the two-box pipeline is Developer then Tester", () => {
    expect(flattenPipelineStages(DEV_TEST_PIPELINE).map((stage) => stage.label)).toEqual([
      "Developer",
      "Tester",
    ]);
  });
});

describe("pipelineUsesEngine", () => {
  test("a pipeline with no personas does not run a harness", () => {
    const personaless: PipelineDefinition = {
      id: "none",
      name: "None",
      description: "",
      groups: [{ stages: [{ id: "a", label: "A" }] }],
    };
    expect(pipelineUsesEngine(personaless)).toBe(false);
  });

  test("a pipeline with any persona-bearing stage runs a real harness", () => {
    expect(pipelineUsesEngine(ONE_BOX_PIPELINE)).toBe(true);
    expect(pipelineUsesEngine(DEV_TEST_PIPELINE)).toBe(true);
    expect(pipelineUsesEngine(GATED_DEV_TEST_PIPELINE)).toBe(true);
  });

  test("one persona among plain stages is enough", () => {
    const mixed: PipelineDefinition = {
      id: "mixed",
      name: "Mixed",
      description: "",
      groups: [
        {
          stages: [{ id: "a", label: "A" }, { id: "b", label: "B", skill: "developer" }],
        },
      ],
    };

    expect(pipelineUsesEngine(mixed)).toBe(true);
  });
});

describe("pipelineUsesEngineById", () => {
  test("classifies the built-in pipelines", () => {
    expect(pipelineUsesEngineById("one-box")).toBe(true);
    expect(pipelineUsesEngineById("dev-test")).toBe(true);
    expect(pipelineUsesEngineById("gated-dev-test")).toBe(true);
  });

  test("an unknown id is not engine-backed", () => {
    // The UI holds only an id; an unknown one must not trigger engine settings.
    expect(pipelineUsesEngineById("nope")).toBe(false);
  });
});

describe("findPipeline", () => {
  test("finds every pipeline the picker offers", () => {
    expect(DEMO_PIPELINES.map((pipeline) => findPipeline(pipeline.id))).toEqual(DEMO_PIPELINES);
  });

  test("returns undefined for an unknown id", () => {
    expect(findPipeline("nope")).toBeUndefined();
  });
});

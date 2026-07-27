// Unit spec: `pipelineUsesEngine` is the switch that decides whether a run
// validates the harness, allocates a workspace, and spends money. Its whole
// point is being derived from the stage model rather than a hardcoded list of
// pipeline ids, so a new pipeline must classify itself correctly.
import { describe, expect, test } from "vitest";
import type { PipelineDefinition } from "../src/pipelines.ts";
import {
  DEMO_PIPELINES,
  PM_DEV_TEST_PIPELINE,
  SOLO_PIPELINE,
  findPipeline,
  isRetiredPipeline,
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

  test("the three-box pipeline is Project Manager, Developer, then Tester", () => {
    expect(flattenPipelineStages(PM_DEV_TEST_PIPELINE).map((stage) => stage.label)).toEqual([
      "Project Manager",
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
    expect(pipelineUsesEngine(SOLO_PIPELINE)).toBe(true);
    expect(pipelineUsesEngine(PM_DEV_TEST_PIPELINE)).toBe(true);
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
    expect(pipelineUsesEngineById("solo")).toBe(true);
    expect(pipelineUsesEngineById("pm-dev-test")).toBe(true);
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

  test("a retired id is gone from the picker but still recognised", () => {
    // Runs already on disk name these; the UI must be able to say so rather
    // than throwing an Unknown pipeline error at the user.
    expect(findPipeline("dev-test")).toBeUndefined();
    expect(isRetiredPipeline("dev-test")).toBe(true);
    expect(isRetiredPipeline("pm-dev-test")).toBe(false);
    expect(isRetiredPipeline("nope")).toBe(false);
  });
});

describe("the shipped set", () => {
  test("is exactly two presets, with the Project Manager flow first", () => {
    expect(DEMO_PIPELINES.map((pipeline) => pipeline.id)).toEqual(["pm-dev-test", "solo"]);
  });

  test("both interactive stages sit behind a persona that knows the QUESTION contract", () => {
    const interactive = DEMO_PIPELINES.flatMap(flattenPipelineStages).filter(
      (stage) => stage.interactive === true,
    );
    expect(interactive.map((stage) => stage.skill)).toEqual(["project-manager", "solo"]);
  });

  test("the human gate survives on the Project Manager handoff", () => {
    const gated = flattenPipelineStages(PM_DEV_TEST_PIPELINE).filter(
      (stage) => stage.gateAfter === true,
    );
    expect(gated.map((stage) => stage.id)).toEqual(["intake"]);
  });
});

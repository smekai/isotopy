// Unit spec: `pipelineUsesEngine` is the switch that decides whether a run
// validates the harness, allocates a workspace, and spends money. Its whole
// point is being derived from the stage model rather than a hardcoded list of
// pipeline ids, so a new pipeline must classify itself correctly.
//
// The shipped presets themselves are data, not logic — asserting their ids and
// labels back would only restate the constant. The one thing worth checking
// across them is an invariant no single definition can enforce alone.
import { describe, expect, test } from "vitest";
import type { PipelineDefinition } from "../src/pipelines.ts";
import {
  DEMO_PIPELINES,
  findPipeline,
  flattenPipelineStages,
  isRetiredPipeline,
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

  test("an unknown id is not engine-backed", () => {
    // The UI holds only an id; an unknown one must not trigger engine settings.
    expect(pipelineUsesEngineById("nope")).toBe(false);
  });
});

describe("retired pipelines", () => {
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
  test("every interactive stage sits behind a persona that knows the QUESTION contract", () => {
    // A stage may only ask if its persona was told how; the two are declared in
    // different files, so nothing but a cross-check catches them drifting apart.
    const interactive = DEMO_PIPELINES.flatMap(flattenPipelineStages).filter(
      (stage) => stage.interactive === true,
    );

    expect(interactive.length).toBeGreaterThan(0);
    expect(interactive.every((stage) => stage.skill !== undefined)).toBe(true);
  });
});

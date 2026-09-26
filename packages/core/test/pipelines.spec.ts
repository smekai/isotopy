// Unit spec: `pipelineUsesEngine` is the switch that decides whether a run
// validates the harness, allocates a workspace, and spends money. Its whole
// point is being derived from the stage model rather than a hardcoded list of
// pipeline ids, so a new pipeline must classify itself correctly.
import { assert, describe, expect, test } from "vitest";
import type { PipelineDefinition, StageDefinition } from "../src/pipelines.ts";
import {
  applyGatePreferences,
  findPipeline,
  flattenPipelineStages,
  gateEnabled,
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

test("a gate the project turned off is resolved off, whatever the pipeline ships", () => {
  const pipeline = findPipeline("pm-dev-test");
  assert(pipeline, "expected the pm-dev-test pipeline to exist");

  const configured = applyGatePreferences(pipeline, { "pm-dev-test:intake": false });

  expect(gateEnabled("pm-dev-test", stageNamed(configured, "intake"))).toBe(false);
});

test("a gate the project added is resolved on, for a stage that ships without one", () => {
  const pipeline = findPipeline("pm-dev-test");
  assert(pipeline, "expected the pm-dev-test pipeline to exist");

  const configured = applyGatePreferences(pipeline, { "pm-dev-test:implementation": true });

  expect(gateEnabled("pm-dev-test", stageNamed(configured, "implementation"))).toBe(true);
});

test("a pipeline nothing overrides is returned untouched, so a plain run stores no definition", () => {
  const pipeline = findPipeline("pm-dev-test");
  assert(pipeline, "expected the pm-dev-test pipeline to exist");

  expect(applyGatePreferences(pipeline, { "full-delivery:intake": false })).toBe(pipeline);
});

test("an override naming a stage the pipeline does not have is ignored, not an error", () => {
  const pipeline = findPipeline("solo");
  assert(pipeline, "expected the solo pipeline to exist");

  expect(applyGatePreferences(pipeline, { "solo:nonexistent": true })).toBe(pipeline);
});

function stageNamed(pipeline: PipelineDefinition, stageId: string): StageDefinition {
  const stage = flattenPipelineStages(pipeline).find((candidate) => candidate.id === stageId);
  assert(stage, `expected a stage named ${stageId}`);
  return stage;
}

test("an internal pipeline ignores gate overrides, because nothing offers them and a gate would park the Orchestrator", () => {
  const pipeline = findPipeline("orchestration");
  assert(pipeline, "expected the orchestration pipeline to exist");

  expect(applyGatePreferences(pipeline, { "orchestration:orchestrate": true })).toBe(pipeline);
});

test("the closeout belongs to the Orchestrator, the only role that saw the whole run", () => {
  const pipeline = findPipeline("full-delivery");
  assert(pipeline, "expected the full-delivery pipeline to exist");

  expect(stageNamed(pipeline, "closeout").skill).toBe("orchestrator");
});

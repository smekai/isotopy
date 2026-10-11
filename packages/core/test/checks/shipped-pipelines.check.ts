// The shipped presets are data, not logic — asserting their ids and labels back would
// only restate the constant. What is worth checking across them is an invariant no
// single definition can enforce alone.
import { expect, test } from "vitest";
import {
  DEMO_PIPELINES,
  flattenPipelineStages,
  pipelineDefinitionSchema,
} from "../../src/pipelines.ts";

const SHIPPED_STAGES = DEMO_PIPELINES.flatMap(flattenPipelineStages);

test("every shipped pipeline satisfies the codec that persists a composed one", () => {
  // The definition types are inferred from this schema, so a shape the schema
  // rejects could still be written by hand and only fail when a composed run
  // is reloaded from disk.
  const rejected = DEMO_PIPELINES.filter(
    (pipeline) => !pipelineDefinitionSchema.safeParse(pipeline).success,
  );

  expect(rejected.map((pipeline) => pipeline.id)).toEqual([]);
});

test("every interactive stage sits behind a persona that knows the QUESTION contract", () => {
  // A stage may only ask if its persona was told how; the two are declared in
  // different files, so nothing but a cross-check catches them drifting apart.
  const interactive = SHIPPED_STAGES.filter((stage) => stage.interactive === true);

  expect(interactive.length).toBeGreaterThan(0);
  expect(interactive.every((stage) => stage.skill !== undefined)).toBe(true);
});

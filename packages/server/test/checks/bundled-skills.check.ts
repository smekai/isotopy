import { describe, expect, test } from "vitest";
import { DEMO_PIPELINES, flattenPipelineStages } from "@isotopy/core";
import {
  loadBundledPersona,
  loadBundledStepTask,
} from "../../src/services/skills.ts";

const STAGES = DEMO_PIPELINES.flatMap(flattenPipelineStages);
const PROTOCOL_ASSIGNMENTS = [
  ["closeout-feature", "isotopy-closeout"],
  ["mediate-question", "isotopy-orchestrator-decision"],
  ["orchestrate", "isotopy-orchestrator-decision"],
  ["plan-milestone", "isotopy-milestone-plan"],
  ["prepare-release", "isotopy-release"],
  ["review-run", "isotopy-run-artifacts"],
  ["review-run", "isotopy-orchestrator-decision"],
] as const;

describe("bundled skills", () => {
  test("every persona a shipped pipeline references is bundled", async () => {
    const referenced = STAGES.map((stage) => stage.skill).filter((id) => id !== undefined);

    const loaded = await Promise.all(referenced.map((id) => loadBundledPersona(id)));

    expect(referenced.length).toBeGreaterThan(0);
    expect(
      referenced.filter((_, index) => !loaded[index]),
      "pipeline stages naming a skill with no bundled persona",
    ).toEqual([]);
  });

  test("every step task a shipped pipeline references is bundled", async () => {
    const referenced = STAGES.map((stage) => stage.stepTask).filter((id) => id !== undefined);

    const loaded = await Promise.all(referenced.map((id) => loadBundledStepTask(id)));

    expect(referenced.length).toBeGreaterThan(0);
    expect(
      referenced.filter((_, index) => !loaded[index]),
      "pipeline stages naming a step task with no bundled assignment",
    ).toEqual([]);
  });

  test.each(PROTOCOL_ASSIGNMENTS)(
    "%s emits the %s fence its consumer expects",
    async (stepTask, fence) => {
      const assignment = await loadBundledStepTask(stepTask);

      expect(assignment).toContain(fence);
    },
  );

  test("the Orchestrator persona requires the decision fence its consumer expects", async () => {
    const persona = await loadBundledPersona("orchestrator");

    expect(persona).toContain("isotopy-orchestrator-decision");
  });

  test("QA stays an ordinary workflow step that never owns the product process", async () => {
    const persona = await loadBundledPersona("tester");
    const assignment = await loadBundledStepTask("verify-feature");

    expect(persona).toContain("ordinary agent-backed workflow step");
    expect(persona).toContain("Playwright");
    expect(persona).toContain("Never start, stop or kill the product yourself");
    expect(assignment).toContain("Do not start it yourself");
    expect(assignment).not.toContain("isotopy-qa-result");
  });
});

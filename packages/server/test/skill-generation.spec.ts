import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  DEMO_PIPELINES,
  flattenPipelineStages,
  MODEL_PROTOCOL_FENCE,
} from "@isotopy/core";
import { REPO_ROOT } from "../src/paths.ts";
import {
  loadBundledPersona,
  loadBundledStepTask,
} from "../src/services/skills.ts";

const GENERATOR = path.join(REPO_ROOT, "scripts", "generate-skills.mjs");
const STAGES = DEMO_PIPELINES.flatMap(flattenPipelineStages);
const PROTOCOL_ASSIGNMENTS = [
  ["closeout-feature", MODEL_PROTOCOL_FENCE.closeout],
  ["mediate-question", MODEL_PROTOCOL_FENCE.orchestratorDecision],
  ["orchestrate", MODEL_PROTOCOL_FENCE.orchestratorDecision],
  ["plan-milestone", MODEL_PROTOCOL_FENCE.milestonePlan],
  ["prepare-release", MODEL_PROTOCOL_FENCE.release],
  ["review-run", MODEL_PROTOCOL_FENCE.runArtifacts],
  ["review-run", MODEL_PROTOCOL_FENCE.orchestratorDecision],
] as const;

describe("skill generation", () => {
  test("committed outputs are in sync with their sources (gen:skills --check)", () => {
    const result = spawnSync(process.execPath, [GENERATOR, "--check"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    });
    expect(result.status, result.stderr || result.stdout).toBe(0);
  });

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

    expect(persona).toContain(MODEL_PROTOCOL_FENCE.orchestratorDecision);
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

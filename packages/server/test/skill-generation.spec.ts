import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { DEMO_PIPELINES, flattenPipelineStages } from "@isotopy/core";
import { REPO_ROOT } from "../src/paths.ts";
import {
  listBundledStepTaskIds,
  loadBundledPersona,
  loadBundledStepTask,
} from "../src/services/skill-assets.ts";
import { parseStepTask } from "../src/schemas/step-task.ts";

async function agentOf(id: string): Promise<string | undefined> {
  const parsed = parseStepTask((await loadBundledStepTask(id)) ?? "");
  return parsed.ok ? parsed.value.agent : undefined;
}

const GENERATOR = path.join(REPO_ROOT, "scripts", "generate-skills.mjs");
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

  test("every bundled step task declares itself, so none reaches a stage half-read", async () => {
    const ids = await listBundledStepTaskIds();

    const declared = await Promise.all(
      ids.map(async (id) => parseStepTask((await loadBundledStepTask(id)) ?? "")),
    );

    expect(ids.length).toBeGreaterThan(0);
    expect(
      ids.filter((_, index) => !declared[index]?.ok),
      "bundled step tasks whose front matter does not parse",
    ).toEqual([]);
  });

  test("every bundled step task names the agent a role may default to", async () => {
    const ids = await listBundledStepTaskIds();

    const agents = await Promise.all(ids.map((id) => agentOf(id)));

    expect(
      ids.filter((_, index) => agents[index] === undefined),
      "bundled step tasks declaring no agent",
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

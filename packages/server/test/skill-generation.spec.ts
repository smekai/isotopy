import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { DEMO_PIPELINES, flattenPipelineStages } from "@adhd/core";
import { REPO_ROOT } from "../src/paths.ts";
import {
  loadBundledPersona,
  loadBundledStepTask,
} from "../src/services/bundled-prompts.ts";

const GENERATOR = path.join(REPO_ROOT, "scripts", "generate-skills.mjs");

describe("skill generation", () => {
  test("committed outputs are in sync with their sources (gen:skills --check)", () => {
    const result = spawnSync(process.execPath, [GENERATOR, "--check"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    });
    expect(result.status, result.stderr || result.stdout).toBe(0);
  });

  test("every persona a shipped pipeline references is bundled", async () => {
    const referenced = DEMO_PIPELINES.flatMap(flattenPipelineStages)
      .map((stage) => stage.skill)
      .filter((skill): skill is string => skill !== undefined);

    expect(referenced.length).toBeGreaterThan(0);
    for (const id of referenced) {
      expect(
        await loadBundledPersona(id),
        `a pipeline stage uses skill "${id}" with no bundled persona`,
      ).toBeTruthy();
    }
  });

  test("every step task a shipped pipeline references is bundled", async () => {
    const referenced = DEMO_PIPELINES.flatMap(flattenPipelineStages)
      .map((stage) => stage.stepTask)
      .filter((stepTask): stepTask is string => stepTask !== undefined);

    expect(referenced.length).toBeGreaterThan(0);
    for (const id of referenced) {
      expect(
        await loadBundledStepTask(id),
        `a pipeline stage uses step task "${id}" with no bundled assignment`,
      ).toBeTruthy();
    }
  });
});

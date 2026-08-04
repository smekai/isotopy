import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { DEMO_PIPELINES, flattenPipelineStages } from "@adhd/core";
import type { StageDefinition } from "@adhd/core";
import { REPO_ROOT } from "../src/paths.ts";
import {
  loadBundledPersona,
  loadBundledStepTask,
} from "../src/services/bundled-prompts.ts";

const GENERATOR = path.join(REPO_ROOT, "scripts", "generate-skills.mjs");

type BundleLoader = (id: string) => Promise<string | undefined>;

function referencedIds(pick: (stage: StageDefinition) => string | undefined): string[] {
  return DEMO_PIPELINES.flatMap(flattenPipelineStages)
    .map(pick)
    .filter((id): id is string => id !== undefined);
}

async function idsWithNothingBundled(ids: string[], load: BundleLoader): Promise<string[]> {
  const loaded = await Promise.all(ids.map(async (id) => [id, await load(id)] as const));
  return loaded.filter(([, content]) => !content).map(([id]) => id);
}

describe("skill generation", () => {
  test("committed outputs are in sync with their sources (gen:skills --check)", () => {
    const result = spawnSync(process.execPath, [GENERATOR, "--check"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    });
    expect(result.status, result.stderr || result.stdout).toBe(0);
  });

  test("every persona a shipped pipeline references is bundled", async () => {
    const referenced = referencedIds((stage) => stage.skill);

    const unbundled = await idsWithNothingBundled(referenced, loadBundledPersona);

    expect(referenced.length).toBeGreaterThan(0);
    expect(unbundled, "pipeline stages naming a skill with no bundled persona").toEqual([]);
  });

  test("every step task a shipped pipeline references is bundled", async () => {
    const referenced = referencedIds((stage) => stage.stepTask);

    const unbundled = await idsWithNothingBundled(referenced, loadBundledStepTask);

    expect(referenced.length).toBeGreaterThan(0);
    expect(unbundled, "pipeline stages naming a step task with no bundled assignment").toEqual([]);
  });

  test("QA stays an ordinary Playwright-only workflow step", async () => {
    const persona = await loadBundledPersona("tester");
    const assignment = await loadBundledStepTask("verify-feature");

    expect(persona).toContain("ordinary agent-backed workflow step");
    expect(persona).toContain("Use Playwright for interactive UI verification");
    expect(persona).toContain("Do not use or depend on an agent-native browser");
    expect(assignment).toContain("For UI work, use Playwright only");
    expect(assignment).not.toContain("adhd-qa-result");
  });
});

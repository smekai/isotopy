// Guards the generated persona bundle. Personas are markdown —
// domain/skills/personas/*.md for the hand-written ones, the gen: blocks of
// docs/architecture.md for the Architect — and scripts/generate-skills.mjs emits
// DEFAULT_SKILLS plus the Claude Code SKILL.md from them. Two things can go wrong
// that nothing else catches: a source edited without re-running the generator, and
// a pipeline naming a skill that was never written.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { DEMO_PIPELINES, flattenPipelineStages } from "@adhd/core";
import { DEFAULT_SKILLS } from "../src/domain/skills/defaults.generated.ts";
import { REPO_ROOT } from "../src/paths.ts";

const GENERATOR = path.join(REPO_ROOT, "scripts", "generate-skills.mjs");

describe("skill generation", () => {
  test("committed outputs are in sync with their sources (gen:skills --check)", () => {
    const result = spawnSync(process.execPath, [GENERATOR, "--check"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    });
    expect(result.status, result.stderr || result.stdout).toBe(0);
  });

  test("every persona a shipped pipeline references is bundled", () => {
    // A stage naming a missing skill does not fail — it runs with no persona and
    // logs a warning — so nothing but this would catch the typo.
    const referenced = DEMO_PIPELINES.flatMap(flattenPipelineStages)
      .map((stage) => stage.skill)
      .filter((skill): skill is string => skill !== undefined);

    expect(referenced.length).toBeGreaterThan(0);
    for (const id of referenced) {
      expect(DEFAULT_SKILLS[id], `a pipeline stage uses skill "${id}" with no bundled persona`).toBeTruthy();
    }
  });
});

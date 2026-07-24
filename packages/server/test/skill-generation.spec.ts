// Guards the generated persona bundle. Persona text is markdown —
// domain/skills/personas/*.md for the hand-written ones, the gen: blocks of
// docs/architect-standards.md for the Architect — and scripts/generate-skills.mjs
// emits DEFAULT_SKILLS plus the Claude Code SKILL.md from them. These checks fail
// the build if a committed output drifts from its source or a rule id goes missing.
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { DEFAULT_SKILLS } from "../src/domain/skills/defaults.generated.ts";
import { REPO_ROOT } from "../src/paths.ts";

const RULE_IDS = ["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9"];
const SKILL_MD = path.join(REPO_ROOT, ".claude", "skills", "architect", "SKILL.md");
const GENERATOR = path.join(REPO_ROOT, "scripts", "generate-skills.mjs");
const PERSONA_DIR = path.join(
  REPO_ROOT,
  "packages",
  "server",
  "src",
  "domain",
  "skills",
  "personas",
);

describe("skill generation", () => {
  test("committed outputs are in sync with their sources (gen:skills --check)", () => {
    const result = spawnSync(process.execPath, [GENERATOR, "--check"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    });
    expect(result.status, result.stderr || result.stdout).toBe(0);
  });

  test("every persona the pipelines reference is bundled", () => {
    for (const id of ["developer", "tester", "architect"]) {
      expect(DEFAULT_SKILLS[id], `no bundled persona for "${id}"`).toBeTruthy();
    }
  });

  test("a markdown persona is bundled verbatim", async () => {
    const onDisk = await readFile(path.join(PERSONA_DIR, "developer.md"), "utf8");
    expect(DEFAULT_SKILLS.developer).toBe(onDisk);
  });

  test("every persona ends with a handoff, not a truncated block", () => {
    for (const [id, text] of Object.entries(DEFAULT_SKILLS)) {
      expect(text.trimEnd().endsWith("prompt."), `persona "${id}" looks truncated`).toBe(true);
    }
  });
});

describe("architect standard", () => {
  test("both consumers declare every rule id", async () => {
    const skillMarkdown = await readFile(SKILL_MD, "utf8");
    const persona = DEFAULT_SKILLS.architect ?? "";
    for (const id of RULE_IDS) {
      expect(skillMarkdown, `SKILL.md is missing rule ${id}`).toContain(id);
      expect(persona, `architect persona is missing rule ${id}`).toContain(id);
    }
  });

  test("the persona ends with a verdict contract", () => {
    const persona = DEFAULT_SKILLS.architect ?? "";
    expect(persona).toContain("VERDICT: PASS");
    expect(persona).toContain("VERDICT: FAIL");
  });
});

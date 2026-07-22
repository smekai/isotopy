// Guards the Architect standard's two generated consumers. The canonical source
// is docs/architect-standards.md; both the Claude Code SKILL.md and the bundled
// persona are emitted by scripts/generate-architect-skill.mjs. These checks fail
// the build if the committed outputs drift from the source, if a rule id goes
// missing, or if the persona stops seeding onto disk.
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { DEFAULT_SKILLS } from "../src/domain/skills/defaults.js";
import { REPO_ROOT } from "../src/paths.js";
import { loadSkill, skillFilePath } from "../src/services/skills.js";

const RULE_IDS = ["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9"];
const SKILL_MD = path.join(REPO_ROOT, ".claude", "skills", "architect", "SKILL.md");
const GENERATOR = path.join(REPO_ROOT, "scripts", "generate-architect-skill.mjs");

describe("architect skill generation", () => {
  test("committed outputs are in sync with the source (gen:skills --check)", () => {
    const result = spawnSync(process.execPath, [GENERATOR, "--check"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    });
    expect(result.status, result.stderr || result.stdout).toBe(0);
  });

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

describe("architect persona seeding", () => {
  let home: string;

  beforeEach(async () => {
    home = await mkdtemp(path.join(os.tmpdir(), "adhd-architect-"));
    process.env.ADHD_HOME = home;
  });

  afterEach(async () => {
    delete process.env.ADHD_HOME;
    await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }).catch(
      () => undefined,
    );
  });

  test("loadSkill('architect') returns the bundled text and writes it to disk", async () => {
    const loaded = await loadSkill("architect");
    expect(loaded).toBe(DEFAULT_SKILLS.architect);

    const seeded = skillFilePath("architect");
    expect(path.dirname(seeded)).toBe(path.join(home, "skills"));
    const onDisk = await readFile(seeded, "utf8");
    expect(onDisk).toBe(DEFAULT_SKILLS.architect);
    expect((await stat(seeded)).isFile()).toBe(true);
  });
});

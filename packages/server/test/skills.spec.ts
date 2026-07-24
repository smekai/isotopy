// Layering, not replacement. A project tweaks a persona with an addendum so
// improvements to the bundled default keep reaching it — the failure mode that
// a full-copy override reproduced every time the defaults improved.
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { DEFAULT_SKILLS } from "../src/domain/skills/defaults.generated.ts";
import { composeSkill } from "../src/domain/skills/compose.ts";
import { homeProjectPaths, skillsDir, userSkillsDir } from "../src/paths.ts";
import { loadSkill } from "../src/services/skills.ts";
import type { ProjectPaths } from "../src/paths.ts";

const ADDENDUM = "Always use pnpm, never npm.";

let home: string;
let userHome: string;
let project: ProjectPaths;

beforeEach(async () => {
  home = await mkdtemp(path.join(os.tmpdir(), "adhd-skills-"));
  userHome = await mkdtemp(path.join(os.tmpdir(), "adhd-skills-user-"));
  process.env.ADHD_HOME = home;
  process.env.ADHD_USER_HOME = userHome;
  project = homeProjectPaths();
});

afterEach(async () => {
  delete process.env.ADHD_HOME;
  delete process.env.ADHD_USER_HOME;
  await Promise.all(
    [home, userHome].map((dir) =>
      rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }).catch(
        () => undefined,
      ),
    ),
  );
});

async function writeSkillFile(dir: string, name: string, content: string): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, name), content);
}

describe("composeSkill", () => {
  test("returns the base untouched when there is no project layer", () => {
    expect(
      composeSkill({ base: "BASE", projectOverride: undefined, projectAddendum: undefined }),
    ).toBe("BASE");
  });

  test("appends an addendum after the base", () => {
    const composed = composeSkill({
      base: "BASE",
      projectOverride: undefined,
      projectAddendum: ADDENDUM,
    });
    expect(composed).toContain("BASE");
    expect(composed).toContain(ADDENDUM);
    expect(composed?.indexOf("BASE")).toBeLessThan(composed?.indexOf(ADDENDUM) ?? -1);
  });

  test("a full override replaces the base but still takes the addendum", () => {
    const composed = composeSkill({
      base: "BASE",
      projectOverride: "OVERRIDE",
      projectAddendum: ADDENDUM,
    });
    expect(composed).not.toContain("BASE");
    expect(composed).toContain("OVERRIDE");
    expect(composed).toContain(ADDENDUM);
  });

  test("an unknown skill with no layers resolves to nothing", () => {
    expect(
      composeSkill({ base: undefined, projectOverride: undefined, projectAddendum: undefined }),
    ).toBeUndefined();
  });
});

describe("loadSkill", () => {
  test("falls back to the bundled default and writes nothing to disk", async () => {
    expect(await loadSkill(project, "developer")).toBe(DEFAULT_SKILLS.developer);
    expect(await readdir(home)).toEqual([]);
    expect(await readdir(userHome)).toEqual([]);
  });

  test("a project addendum extends the bundled default instead of replacing it", async () => {
    await writeSkillFile(skillsDir(project), "developer.project.md", ADDENDUM);

    const loaded = await loadSkill(project, "developer");

    expect(loaded).toContain("# Role: Developer");
    expect(loaded).toContain(ADDENDUM);
  });

  test("a user-level skill overrides the bundled default", async () => {
    await writeSkillFile(userSkillsDir(), "developer.md", "USER BASE");

    expect(await loadSkill(project, "developer")).toBe("USER BASE");
  });

  test("a project file fully replaces the base for power users", async () => {
    await writeSkillFile(userSkillsDir(), "developer.md", "USER BASE");
    await writeSkillFile(skillsDir(project), "developer.md", "PROJECT BASE");

    const loaded = await loadSkill(project, "developer");

    expect(loaded).toBe("PROJECT BASE");
  });

  test("an unknown skill resolves to undefined", async () => {
    expect(await loadSkill(project, "no-such-skill")).toBeUndefined();
  });
});

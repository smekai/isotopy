// Layering, not replacement. A project tweaks a persona with an addendum so
// improvements to the bundled default keep reaching it — the failure mode that
// a full-copy override reproduced every time the defaults improved.
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { homeProjectPaths, skillsDir, userSkillsDir } from "../src/paths.ts";
import {
  loadBundledPersona,
  loadSkill,
  personaNotesPath,
  projectSkillAddendumPath,
} from "../src/services/skills.ts";
import type { ProjectPath } from "../src/paths.ts";

const ADDENDUM = "Always use pnpm, never npm.";

let home: string;
let userHome: string;
let project: ProjectPath;

beforeEach(async () => {
  home = await mkdtemp(path.join(os.tmpdir(), "isotopy-skills-"));
  userHome = await mkdtemp(path.join(os.tmpdir(), "isotopy-skills-user-"));
  process.env.ISOTOPY_HOME = home;
  process.env.ISOTOPY_USER_HOME = userHome;
  project = homeProjectPaths();
});

afterEach(async () => {
  delete process.env.ISOTOPY_HOME;
  delete process.env.ISOTOPY_USER_HOME;
  await Promise.all(
    [home, userHome].map((dir) =>
      rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }).catch(
        () => undefined,
      ),
    ),
  );
});

test("with no layers of its own, a persona is the bundled default and nothing is written", async () => {
  // Arrange
  const bundled = await loadBundledPersona("developer");

  // Act
  const loaded = await loadSkill(project, "developer");

  // Assert
  expect(loaded).toBe(bundled?.replace(/\r\n/g, "\n").trim());
  expect(await readdir(home)).toEqual([]);
  expect(await readdir(userHome)).toEqual([]);
});

test("a project addendum follows the bundled default instead of replacing it", async () => {
  // Arrange
  await writeSkillFile(skillsDir(project), "developer.project.md", ADDENDUM);

  // Act
  const loaded = await loadSkill(project, "developer");

  // Assert
  expect(loaded).toContain("# Role: Developer");
  expect(loaded?.indexOf("# Role: Developer")).toBeLessThan(loaded?.indexOf(ADDENDUM) ?? -1);
});

test("a user-level skill overrides the bundled default", async () => {
  // Arrange
  await writeSkillFile(userSkillsDir(), "developer.md", "USER BASE");

  // Act
  const loaded = await loadSkill(project, "developer");

  // Assert
  expect(loaded).toBe("USER BASE");
});

test("a project file fully replaces the base for power users", async () => {
  // Arrange
  await writeSkillFile(userSkillsDir(), "developer.md", "USER BASE");
  await writeSkillFile(skillsDir(project), "developer.md", "PROJECT BASE");

  // Act
  const loaded = await loadSkill(project, "developer");

  // Assert
  expect(loaded).toBe("PROJECT BASE");
});

test("a project that replaces the base still gets its addendum", async () => {
  // Arrange
  await writeSkillFile(skillsDir(project), "developer.md", "PROJECT BASE");
  await writeSkillFile(skillsDir(project), "developer.project.md", ADDENDUM);

  // Act
  const loaded = await loadSkill(project, "developer");

  // Assert
  expect(loaded).toContain("PROJECT BASE");
  expect(loaded).toContain(ADDENDUM);
  expect(loaded).not.toContain("# Role: Developer");
});

test("an unknown skill resolves to nothing", async () => {
  // Act
  const loaded = await loadSkill(project, "no-such-skill");

  // Assert
  expect(loaded).toBeUndefined();
});

test("notes sit after the project's own instructions, so a project override still leads", async () => {
  // Arrange
  await mkdir(skillsDir(project), { recursive: true });
  await writeFile(projectSkillAddendumPath(project, "developer"), "Always run pnpm lint.");
  await writeFile(personaNotesPath(project, "developer"), "- Migrations live in db/migrate\n");

  // Act
  const composed = await loadSkill(project, "developer");

  // Assert
  expect(composed?.indexOf("Always run pnpm lint")).toBeLessThan(
    composed?.indexOf("Migrations live in db/migrate") ?? -1,
  );
});

async function writeSkillFile(dir: string, name: string, content: string): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, name), content);
}

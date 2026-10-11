// Who may be on a team is whatever the catalog holds: the bundled agents, plus what a
// project brings under `.isotopy/agents/` and `.isotopy/steps/`. A persona still
// layers — a project tweaks one with an addendum, and what a role learned follows it —
// so an improvement to a bundled default keeps reaching every project that did not
// replace it.
import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { agentsDir, homeProjectPaths, skillsDir, userSkillsDir } from "../../src/paths.ts";
import type { ProjectPath } from "../../src/paths.ts";
import { AgentCatalog } from "../../src/services/agent-catalog.ts";
import { writeProjectAgent, writeProjectStep, writeText } from "../support/agent-files.ts";
import { RecordingLogger } from "../support/recording-logger.ts";

const ADDENDUM = "Always use pnpm, never npm.";

let home: string;
let userHome: string;
let project: ProjectPath;
let logger: RecordingLogger;
let catalog: AgentCatalog;

beforeEach(async () => {
  home = await mkdtemp(path.join(os.tmpdir(), "isotopy-agents-"));
  userHome = await mkdtemp(path.join(os.tmpdir(), "isotopy-agents-user-"));
  process.env.ISOTOPY_HOME = home;
  process.env.ISOTOPY_USER_HOME = userHome;
  project = homeProjectPaths();
  logger = new RecordingLogger();
  catalog = new AgentCatalog(logger);
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

test("with nothing of its own, a persona is the bundled default and nothing is written", async () => {
  // Act
  const persona = await catalog.persona(project, "developer");

  // Assert
  expect(persona).toMatch(/^# Role: Developer/);
  expect(await readdir(home)).toEqual([]);
  expect(await readdir(userHome)).toEqual([]);
});

test("a project addendum follows the bundled default instead of replacing it", async () => {
  // Arrange
  await writeText(path.join(skillsDir(project), "developer.project.md"), ADDENDUM);

  // Act
  const persona = await catalog.persona(project, "developer");

  // Assert
  expect(persona?.indexOf("# Role: Developer")).toBe(0);
  expect(persona).toContain(ADDENDUM);
});

test("a user-level skill overrides the bundled default", async () => {
  // Arrange
  await writeText(path.join(userSkillsDir(), "developer.md"), "USER BASE");

  // Act
  const persona = await catalog.persona(project, "developer");

  // Assert
  expect(persona).toBe("USER BASE");
});

test("a project agent with a bundled id replaces the bundled text and keeps the project's addendum and notes", async () => {
  // Arrange
  await writeProjectAgent(project.dataDir, { id: "developer", title: "House Developer" });
  await writeText(path.join(skillsDir(project), "developer.project.md"), ADDENDUM);
  await writeText(path.join(skillsDir(project), "developer.notes.md"), "- Migrations live in db/migrate\n");

  // Act
  const persona = await catalog.persona(project, "developer");

  // Assert
  expect(persona).toMatch(/^# Role: House Developer/);
  expect(persona).not.toContain("# Role: Developer");
  expect(persona).toContain(ADDENDUM);
  expect(persona).toContain("Migrations live in db/migrate");
});

test("a project agent outranks the user-level override, because the project chose it", async () => {
  // Arrange
  await writeText(path.join(userSkillsDir(), "developer.md"), "USER BASE");
  await writeProjectAgent(project.dataDir, { id: "developer", title: "House Developer" });

  // Act
  const persona = await catalog.persona(project, "developer");

  // Assert
  expect(persona).toMatch(/^# Role: House Developer/);
});

test("an agent nobody brings resolves to nothing", async () => {
  // Act
  const persona = await catalog.persona(project, "no-such-agent");

  // Assert
  expect(persona).toBeUndefined();
});

test("a persona id that would climb out of the skills folder resolves to nothing", async () => {
  // Arrange
  await writeText(path.join(userHome, "outside.md"), "OUTSIDE");

  // Act
  const persona = await catalog.persona(project, "../outside");

  // Assert
  expect(persona).toBeUndefined();
});

test("notes sit after the project's own instructions, so a project override still leads", async () => {
  // Arrange
  await writeText(path.join(skillsDir(project), "developer.project.md"), "Always run pnpm lint.");
  await writeText(path.join(skillsDir(project), "developer.notes.md"), "- Migrations live in db/migrate\n");

  // Act
  const persona = await catalog.persona(project, "developer");

  // Assert
  expect(persona?.indexOf("Always run pnpm lint")).toBeLessThan(
    persona?.indexOf("Migrations live in db/migrate") ?? -1,
  );
});

test("an agent the project brings joins the catalog beside the bundled ones", async () => {
  // Arrange
  await writeProjectAgent(project.dataDir);

  // Act
  const { personas } = await catalog.catalog(project);

  // Assert
  expect(personas.find((persona) => persona.id === "growth-marketer")).toMatchObject({
    title: "Growth Marketer",
    glyph: "✶",
    origin: "project",
  });
  expect(personas.find((persona) => persona.id === "developer")?.origin).toBe("bundled");
});

test("a malformed agent file is left out and reported, and the rest of the catalog survives", async () => {
  // Arrange
  await writeText(
    path.join(agentsDir(project), "growth-marketer", "agent.md"),
    "# Role: Growth Marketer\n\nNo front matter.",
  );
  await writeProjectAgent(project.dataDir, { id: "seo-writer", title: "SEO Writer" });

  // Act
  const { personas } = await catalog.catalog(project);

  // Assert
  expect(personas.map((persona) => persona.id)).toContain("seo-writer");
  expect(personas.map((persona) => persona.id)).not.toContain("growth-marketer");
  expect(warnings()).toEqual([expect.stringContaining("growth-marketer")]);
});

test("a folder that is not a lowercase id never reaches the catalog, so it cannot shadow one that is", async () => {
  // Arrange
  await writeProjectAgent(project.dataDir, { id: "Growth-Marketer" });

  // Act
  const { personas } = await catalog.catalog(project);

  // Assert
  expect(personas.map((persona) => persona.id.toLowerCase())).not.toContain("growth-marketer");
  expect(warnings()).toEqual([expect.stringContaining("Growth-Marketer")]);
});

test("a folder with no agent.md that names no bundled agent is skipped and reported", async () => {
  // Arrange
  await mkdir(path.join(agentsDir(project), "growth-marketer"), { recursive: true });

  // Act
  const { personas } = await catalog.catalog(project);

  // Assert
  expect(personas.map((persona) => persona.id)).not.toContain("growth-marketer");
  expect(warnings()).toEqual([expect.stringContaining("agent.md")]);
});

test("a step the project brings replaces the bundled step of the same id", async () => {
  // Arrange
  await writeProjectStep(project.dataDir, { id: "plan-feature", body: "# Assignment: House planning" });

  // Act
  const assignment = await catalog.stepTask(project, "plan-feature");

  // Assert
  expect(assignment).toBe("# Assignment: House planning");
});

test("a project step reusing an Orchestrator-only id stays out of what a team may compose", async () => {
  // Arrange
  await writeProjectStep(project.dataDir, { id: "orchestrate" });

  // Act
  const known = await catalog.knownIds(project);

  // Assert
  expect(known.steps.has("orchestrate")).toBe(false);
});

function warnings(): string[] {
  return logger.at("warn").map((entry) => entry.message);
}

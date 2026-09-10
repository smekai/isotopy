// Step tasks layer the way personas do — bundled default, user override, project
// override, project addendum — so a project grows the library instead of waiting
// for Isotopy to ship an assignment it needs. Persona notes stay persona-only.
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, assert, beforeEach, expect, test } from "vitest";
import { homeProjectPaths, stepTasksDir, userStepTasksDir } from "../src/paths.ts";
import type { ProjectPath } from "../src/paths.ts";
import { loadStepTask, stepTaskLibrary } from "../src/services/step-tasks.ts";
import type { StepTask } from "../src/services/step-tasks.ts";

const ADDENDUM = "Run pnpm, never npm.";

const PROJECT_STEP_TASK = [
  "---",
  "agent: developer",
  "summary: Migrate one database table.",
  "---",
  "",
  "# Assignment: Migrate a table",
].join("\n");

let home: string;
let userHome: string;
let project: ProjectPath;

beforeEach(async () => {
  home = await mkdtemp(path.join(os.tmpdir(), "isotopy-step-tasks-"));
  userHome = await mkdtemp(path.join(os.tmpdir(), "isotopy-step-tasks-user-"));
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

test("a bundled step task resolves without writing anything to disk", async () => {
  // Arrange — nothing; the bundled library is the default.
  // Act
  const loaded = await loadStepTask(project, "implement-feature");

  // Assert
  expect(valueOf(loaded).agent).toBe("developer");
  expect(await readdir(home)).toEqual([]);
});

test("a project addendum extends the bundled assignment instead of replacing it", async () => {
  // Arrange
  await writeStepTask(stepTasksDir(project), "implement-feature.project.md", ADDENDUM);

  // Act
  const loaded = await loadStepTask(project, "implement-feature");

  // Assert
  expect(valueOf(loaded).assignment).toContain(ADDENDUM);
  expect(valueOf(loaded).agent).toBe("developer");
});

test("a project override replaces the bundled front matter as well as its prose", async () => {
  // Arrange
  await writeStepTask(stepTasksDir(project), "implement-feature.md", PROJECT_STEP_TASK);

  // Act
  const loaded = await loadStepTask(project, "implement-feature");

  // Assert
  expect(valueOf(loaded).summary).toBe("Migrate one database table.");
});

test("a user override sits under the project's, so a project still has the last word", async () => {
  // Arrange
  await writeStepTask(userStepTasksDir(), "implement-feature.md", PROJECT_STEP_TASK);

  // Act
  const loaded = await loadStepTask(project, "implement-feature");

  // Assert
  expect(valueOf(loaded).summary).toBe("Migrate one database table.");
});

test("a project step task the bundled library never knew is offered to the Orchestrator", async () => {
  // Arrange
  await writeStepTask(stepTasksDir(project), "migrate-schema.md", PROJECT_STEP_TASK);

  // Act
  const library = await stepTaskLibrary(project);

  // Assert
  expect(library.composable).toContainEqual({
    id: "migrate-schema",
    summary: "Migrate one database table.",
  });
});

// The catalog used to be a hand-written array that simply omitted Isotopy's own
// steps. Discovery reads the whole directory, so `internal` is what keeps them out.
test("Isotopy's own steps are never offered to the team the Orchestrator composes", async () => {
  // Arrange — nothing; the bundled library declares them internal.
  // Act
  const library = await stepTaskLibrary(project);

  // Assert
  expect(library.composable.map((entry) => entry.id)).not.toContain("orchestrate");
});

test("Isotopy's own steps are still loadable by the code that runs them", async () => {
  // Arrange — nothing.
  // Act
  const library = await stepTaskLibrary(project);

  // Assert
  expect(library.byId.get("orchestrate")?.internal).toBe(true);
});

test("a project step task with no summary falls back to its assignment heading", async () => {
  // Arrange
  await writeStepTask(stepTasksDir(project), "migrate-schema.md", "# Assignment: Migrate a table");

  // Act
  const loaded = await loadStepTask(project, "migrate-schema");

  // Assert
  expect(valueOf(loaded).summary).toBe("Migrate a table");
});

test("a malformed project step task is refused with a stated reason, not read halfway", async () => {
  // Arrange
  await writeStepTask(stepTasksDir(project), "migrate-schema.md", "---\nagents: dev\n---\n\nBody.");

  // Act
  const loaded = await loadStepTask(project, "migrate-schema");

  // Assert
  assert(loaded !== undefined && !loaded.ok, "expected the step task to be refused");
  expect(loaded.issues).not.toHaveLength(0);
});

test("a step task nobody wrote resolves to nothing", async () => {
  // Arrange — nothing.
  // Act
  const loaded = await loadStepTask(project, "invent-a-language");

  // Assert
  expect(loaded).toBeUndefined();
});

async function writeStepTask(dir: string, name: string, content: string): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, name), content);
}

function valueOf(loaded: Awaited<ReturnType<typeof loadStepTask>>): StepTask {
  assert(loaded?.ok, "expected the step task to load");
  return loaded.value;
}

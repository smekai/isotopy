// The Product Manager's closeout is the one stage that writes outside the run
// directory — it moves tasks on the board and deletes files. Each test arranges
// only the part of a project it asserts on, so nothing here sets up a task board
// for a test about cleanup, or a browser profile for a test about the board.
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { FULL_DELIVERY_PIPELINE, createInitialRunState } from "@adhd/core";
import type { ProjectPath } from "../../src/paths.ts";
import { applyProductManagerCloseout } from "../../src/services/product-manager-closeout.ts";

const roots: string[] = [];

const BOARD_CONFIG = {
  idPrefix: "TASK",
  nextId: 3,
  states: [
    { name: "Backlog", fileName: "BACKLOG.md" },
    { name: "In Progress", fileName: "IN_PROGRESS.md" },
    { name: "Done", fileName: "DONE.md" },
  ],
  tags: ["server"],
  insertPosition: "top",
};

const IN_PROGRESS_TASKS = [
  "# In Progress",
  "",
  "## TASK-001: Delivered work",
  "**Priority:** P0",
  "",
  "Done.",
  "",
  "---",
  "",
  "## TASK-002: Unresolved work",
  "**Priority:** P1",
  "",
  "Still open.",
  "",
  "---",
  "",
].join("\n");

/** Delivers TASK-001, leaves TASK-002 open, and asks for two cleanups. */
const PARTIAL_DELIVERY = {
  summary: "Delivered one task and preserved one unresolved task.",
  deliveredScope: ["TASK-001"],
  decisions: ["Keep the adapter boundary"],
  knowledge: ["TaskPlanner is file-backed"],
  findings: [
    {
      id: "remaining-gap",
      title: "Unresolved work remains",
      severity: "blocking",
      evidence: "TASK-002",
    },
  ],
  tasks: [
    {
      findingId: "remaining-gap",
      title: "Resolve the remaining gap",
      description: "Finish and verify TASK-002.",
      priority: "P1",
      tags: ["server"],
    },
  ],
  completedTaskIds: ["TASK-001"],
  unresolvedTaskIds: ["TASK-002"],
  cleanup: [
    { relativePath: "browser-profile", reason: "Run-owned browser profile" },
    { relativePath: "../user-work.txt", reason: "Must be rejected" },
  ],
  nextRecommendation: "Resolve TASK-002",
};

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) =>
      rm(root, { recursive: true, force: true, maxRetries: 5 }),
    ),
  );
});

test("only the tasks the report calls completed move to Done", async () => {
  // Arrange
  const project = await makeProject();
  const run = makeCloseoutRun();
  await writeTaskBoard(project);

  // Act
  const record = await applyProductManagerCloseout(
    project,
    run,
    closeoutOutput(PARTIAL_DELIVERY, "FAIL"),
  );

  // Assert
  expect(record.validationErrors).toEqual([]);
  expect(record.createdTasks).toMatchObject([{ id: "TASK-003", backend: "taskplanner" }]);
  expect(await readFile(path.join(project.root, ".tasks", "DONE.md"), "utf8"))
    .toContain("## TASK-001:");
  expect(await readFile(path.join(project.root, ".tasks", "IN_PROGRESS.md"), "utf8"))
    .toContain("## TASK-002:");
  expect(
    await readFile(
      path.join(project.dataDir, "runs", run.id, "closeout", "closeout.md"),
      "utf8",
    ),
  ).toContain("# Product Manager closeout");
});

test("cleanup deletes inside the run directory and refuses to escape it", async () => {
  // Arrange — the run's own temp dir, plus a decoy the report will try to reach.
  const project = await makeProject();
  const run = makeCloseoutRun();
  await writeTaskBoard(project);
  await mkdir(path.join(project.dataDir, "runs", run.id, "tmp", "browser-profile"), {
    recursive: true,
  });
  await writeFile(path.join(project.root, "user-work.txt"), "preserve");

  // Act
  const record = await applyProductManagerCloseout(
    project,
    run,
    closeoutOutput(PARTIAL_DELIVERY, "FAIL"),
  );

  // Assert — a traversal out of the run directory is rejected, not obeyed.
  expect(record.cleanup).toEqual({
    removed: ["browser-profile"],
    rejected: ["../user-work.txt"],
  });
  await expect(
    access(path.join(project.dataDir, "runs", run.id, "tmp", "browser-profile")),
  ).rejects.toThrow();
  expect(await readFile(path.join(project.root, "user-work.txt"), "utf8")).toBe("preserve");
});

test("closing the same run out twice does not file the follow-up task again", async () => {
  // Arrange — a run already closed out once.
  const project = await makeProject();
  const run = makeCloseoutRun();
  await writeTaskBoard(project);
  const output = closeoutOutput(PARTIAL_DELIVERY, "FAIL");
  await applyProductManagerCloseout(project, run, output);

  // Act
  const second = await applyProductManagerCloseout(project, run, output);

  // Assert
  expect(second.createdTasks).toEqual([]);
  const backlog = await readFile(path.join(project.root, ".tasks", "BACKLOG.md"), "utf8");
  expect(backlog.match(/ADHD-FINDING:/g)).toHaveLength(1);
});

test("keeps findings and follow-up tasks when the agent writes a hyphenated severity", async () => {
  // Arrange
  const project = await makeProject();
  const run = makeCloseoutRun();
  await writeTaskBoard(project);
  const report = {
    summary: "Delivered the work with one cosmetic gap.",
    deliveredScope: ["TASK-001"],
    decisions: [],
    knowledge: [],
    findings: [
      {
        id: "cosmetic-gap",
        title: "Spacing is off on the dashboard",
        severity: "non-blocking",
        evidence: "Milestone dashboard",
      },
    ],
    tasks: [
      {
        findingId: "cosmetic-gap",
        title: "Fix the dashboard spacing",
        description: "Align the feature cards.",
        priority: "P3",
        tags: ["server"],
      },
    ],
    completedTaskIds: ["TASK-001", "TASK-002"],
    unresolvedTaskIds: [],
    cleanup: [],
  };

  // Act
  const record = await applyProductManagerCloseout(project, run, closeoutOutput(report, "PASS"));

  // Assert — the agent boundary normalises the prose the model wrote.
  expect(record.validationErrors).toEqual([]);
  expect(record.report.findings).toMatchObject([{ severity: "non_blocking" }]);
  expect(record.createdTasks).toMatchObject([{ id: "TASK-003", backend: "taskplanner" }]);
  expect(
    await readFile(path.join(project.root, ".tasks", "BACKLOG.md"), "utf8"),
  ).toContain("Fix the dashboard spacing");
});

/** An empty project root, swept by the afterEach above. */
async function makeProject(): Promise<ProjectPath> {
  const root = await mkdtemp(path.join(os.tmpdir(), "adhd-closeout-"));
  roots.push(root);
  return { id: "project", root, dataDir: path.join(root, ".adhd") };
}

/** A TaskPlanner board holding TASK-001 and TASK-002, both in progress. */
async function writeTaskBoard(project: ProjectPath): Promise<void> {
  const tasksDir = path.join(project.root, ".tasks");
  await mkdir(tasksDir, { recursive: true });
  await writeFile(
    path.join(tasksDir, "config.json"),
    `${JSON.stringify(BOARD_CONFIG, null, 2)}\n`,
  );
  await writeFile(path.join(tasksDir, "BACKLOG.md"), "# Backlog\n");
  await writeFile(path.join(tasksDir, "IN_PROGRESS.md"), IN_PROGRESS_TASKS);
  await writeFile(path.join(tasksDir, "DONE.md"), "# Done\n");
}

function makeCloseoutRun() {
  return createInitialRunState({
    runId: "run-001",
    number: 1,
    projectId: "project",
    pipeline: FULL_DELIVERY_PIPELINE,
    milestoneId: "milestone",
    featureId: "feature",
    sourceTaskIds: ["TASK-001", "TASK-002"],
  });
}

function closeoutOutput(report: object, verdict: "PASS" | "FAIL"): string {
  return `\`\`\`adhd-closeout\n${JSON.stringify(report)}\n\`\`\`\n\nVERDICT: ${verdict}`;
}

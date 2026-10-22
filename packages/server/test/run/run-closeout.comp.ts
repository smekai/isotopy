// The Product Manager's closeout is the one stage that writes outside the run
// directory — it moves tasks on the board and deletes files. Each test arranges
// only the part of a project it asserts on, so nothing here sets up a task board
// for a test about cleanup, or a browser profile for a test about the board.
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { FULL_DELIVERY_PIPELINE, createInitialRunState } from "@isotopy/core";
import { parseTasks } from "@smekai/taskplanner";
import type { FollowUpTaskDraft, RunBranch, RunState, StageDefinition } from "@isotopy/core";
import { ensureProjectDataDir } from "../../src/paths.ts";
import type { ProjectPath } from "../../src/paths.ts";
import {
  CloseoutConsumer,
  applyCloseoutReport,
} from "../../src/services/consumers/closeout-consumer.ts";
import type { ProjectRegistry } from "../../src/services/project-registry.ts";
import {
  commitEverything,
  currentBranch,
  dirtyPaths,
  fileAt,
  initGitRepository,
  stageFile,
  installHook,
  switchToNewBranch,
} from "../support/git-project.ts";

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
  const { record, reportErrors } = await applyCloseoutReport(
    project,
    run,
    closeoutOutput(PARTIAL_DELIVERY, "FAIL"),
  );

  // Assert
  expect(reportErrors).toEqual([]);
  expect(record.validationErrors).toEqual([]);
  expect(record.createdTasks).toMatchObject([{ id: "TASK-003" }]);
  expect(await readFile(path.join(project.root, ".tasks", "DONE.md"), "utf8"))
    .toContain("## TASK-001:");
  expect(await readFile(path.join(project.root, ".tasks", "IN_PROGRESS.md"), "utf8"))
    .toContain("## TASK-002:");
  expect(
    await readFile(
      path.join(project.dataDir, "runs", run.id, "closeout", "closeout.md"),
      "utf8",
    ),
  ).toContain("# Run closeout");
});

// The team may propose the work that spends money or needs a credential; it may
// not start it. Nothing in the product clears the mark once it is written.
test("a closeout may create a follow-up marked for the owner", async () => {
  // Arrange
  const project = await makeProject();
  const run = makeCloseoutRun();
  await writeTaskBoard(project);

  // Act
  const { record } = await applyCloseoutReport(
    project,
    run,
    closeoutOutput(markedDelivery(), "PASS"),
  );

  // Assert
  expect(record.validationErrors).toEqual([]);
  expect(record.createdTasks).toMatchObject([{ id: "TASK-003" }]);
  expect(await readFile(path.join(project.root, ".tasks", "BACKLOG.md"), "utf8"))
    .toContain("**Assignee:** owner");
});

test("the mark round-trips, so the parser that reads the board back sees the same owner", async () => {
  // Arrange
  const project = await makeProject();
  const run = makeCloseoutRun();
  await writeTaskBoard(project);
  await applyCloseoutReport(project, run, closeoutOutput(markedDelivery(), "PASS"));

  // Act
  const parsed = parseTasks(
    await readFile(path.join(project.root, ".tasks", "BACKLOG.md"), "utf8"),
  );

  // Assert
  expect(parsed.tasks.map((task) => task.assignee)).toEqual(["owner"]);
});

test("moving a marked task to Done leaves the mark, because a transition moves a section", async () => {
  // Arrange
  const project = await makeProject();
  const run = makeCloseoutRun();
  await writeTaskBoard(project);
  await writeFile(
    path.join(project.root, ".tasks", "IN_PROGRESS.md"),
    "# In Progress\n\n## TASK-001: Marked\n**Priority:** P1 | **Assignee:** owner\n\nBody.\n\n---\n",
  );

  // Act
  await applyCloseoutReport(project, run, closeoutOutput(PARTIAL_DELIVERY, "FAIL"));

  // Assert
  expect(await readFile(path.join(project.root, ".tasks", "DONE.md"), "utf8"))
    .toContain("**Assignee:** owner");
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
  const { record } = await applyCloseoutReport(
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

test("a follow-up naming a finding the report never declared is not filed on the board", async () => {
  // Arrange
  const project = await makeProject();
  const run = makeCloseoutRun();
  await writeTaskBoard(project);
  const report = {
    ...PARTIAL_DELIVERY,
    tasks: [{ ...PARTIAL_DELIVERY.tasks[0], findingId: "never-declared" }],
  };

  // Act
  const { record } = await applyCloseoutReport(project, run, closeoutOutput(report, "FAIL"));

  // Assert
  expect(record.createdTasks).toEqual([]);
  expect(record.validationErrors.join("\n")).toContain("never-declared");
});

test("closing the same run out twice does not file the follow-up task again", async () => {
  // Arrange — a run already closed out once.
  const project = await makeProject();
  const run = makeCloseoutRun();
  await writeTaskBoard(project);
  const output = closeoutOutput(PARTIAL_DELIVERY, "FAIL");
  await applyCloseoutReport(project, run, output);

  // Act
  const { record: second } = await applyCloseoutReport(project, run, output);

  // Assert
  expect(second.createdTasks).toEqual([]);
  const backlog = await readFile(path.join(project.root, ".tasks", "BACKLOG.md"), "utf8");
  expect([...backlog.matchAll(/\*\*Isotopy origin:\*\*/g)]).toHaveLength(1);
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
  const { record, reportErrors } = await applyCloseoutReport(
    project,
    run,
    closeoutOutput(report, "PASS"),
  );

  // Assert — the agent boundary normalises the prose the model wrote.
  expect(reportErrors).toEqual([]);
  expect(record.validationErrors).toEqual([]);
  expect(record.report.findings).toMatchObject([{ severity: "non_blocking" }]);
  expect(record.createdTasks).toMatchObject([{ id: "TASK-003" }]);
  expect(
    await readFile(path.join(project.root, ".tasks", "BACKLOG.md"), "utf8"),
  ).toContain("Fix the dashboard spacing");
});

test("a task-board failure is recorded in the closeout without making the report unusable", async () => {
  // Arrange — a board whose config cannot be parsed, so creating tasks throws.
  const project = await makeProject();
  const run = makeCloseoutRun();
  const tasksDir = path.join(project.root, ".tasks");
  await mkdir(tasksDir, { recursive: true });
  await writeFile(path.join(tasksDir, "config.json"), "{ not json");

  // Act
  const { record, reportErrors } = await applyCloseoutReport(
    project,
    run,
    closeoutOutput(PARTIAL_DELIVERY, "FAIL"),
  );

  // Assert — the report parsed fine; only the side effect broke.
  expect(reportErrors).toEqual([]);
  expect(record.validationErrors.join("\n")).toContain("Task creation failed");
});


// TASK-150 made a team composed per run, so `team-<id>-<n>` is now the common
// pipeline id and `full-delivery` the exception. The consumer used to fire only
// on the fixed pipeline, which left every composed team's closeout inert: the
// report was written, and no task ever moved.
test("a composed team's closeout is applied, not ignored for having another pipeline id", async () => {
  // Arrange
  const project = await makeProject();
  const run = makeComposedTeamRun();
  await writeTaskBoard(project);

  // Act
  const rejection = await new CloseoutConsumer(registryFor(project)).consume(
    run,
    COMPOSED_CLOSEOUT_STAGE,
    closeoutOutput(PARTIAL_DELIVERY, "FAIL"),
  );

  // Assert
  expect(rejection).toBeUndefined();
  expect(run.closeout?.createdTasks).toMatchObject([{ id: "TASK-003" }]);
  expect(await readFile(path.join(project.root, ".tasks", "DONE.md"), "utf8"))
    .toContain("## TASK-001:");
});

test("a stage that is not a closeout is left alone, whatever pipeline it belongs to", async () => {
  // Arrange
  const project = await makeProject();
  const run = makeComposedTeamRun();

  // Act
  const rejection = await new CloseoutConsumer(registryFor(project)).consume(
    run,
    { ...COMPOSED_CLOSEOUT_STAGE, stepTask: "implement-feature" },
    closeoutOutput(PARTIAL_DELIVERY, "FAIL"),
  );

  // Assert
  expect(rejection).toBeUndefined();
  expect(run.closeout).toBeUndefined();
});
// ShareTravel's initiative bdd1c288 ended runs with 33 follow-ups written to the
// board and never committed; the next brief then told agents to keep off `.tasks`
// as "someone else's uncommitted edits".
test("an initiative's board edits land in a commit on its branch, through the project's own hooks", async () => {
  // Arrange — a project whose pre-commit hook bumps its version, as ShareTravel's does.
  const project = await makeProject();
  await writeTaskBoard(project);
  await writeFile(path.join(project.root, "VERSION"), "1\n");
  await ensureProjectDataDir(project);
  await initGitRepository(project.root);
  await commitEverything(project.root, "Initial");
  await switchToNewBranch(project.root, INITIATIVE_BRANCH.name);
  await installHook(project.root, "pre-commit", 'echo 2 > VERSION && git add VERSION');

  // Act
  const { record } = await applyCloseoutReport(
    project,
    initiativeRun({ branch: INITIATIVE_BRANCH }),
    closeoutOutput(OUTSIDE_SCOPE_DELIVERY, "PASS"),
  );

  // Assert
  expect(record.validationErrors).toEqual([]);
  expect(await dirtyPaths(project.root)).toEqual([]);
  expect(await currentBranch(project.root)).toBe(INITIATIVE_BRANCH.name);
  expect(await fileAt(project.root, "HEAD", ".tasks/BACKLOG.md")).toContain("Index the archive");
  expect(await fileAt(project.root, "HEAD", ".tasks/DONE.md")).toContain("## TASK-001:");
  expect(await fileAt(project.root, "HEAD", "VERSION")).toBe("2");
});

test("a board commit the project's hook refuses is recorded on the closeout, not lost", async () => {
  // Arrange
  const project = await makeProject();
  await writeTaskBoard(project);
  await initGitRepository(project.root);
  await commitEverything(project.root, "Initial");
  await switchToNewBranch(project.root, INITIATIVE_BRANCH.name);
  await installHook(project.root, "pre-commit", "echo 'lint failed' >&2; exit 1");

  // Act
  const { record } = await applyCloseoutReport(
    project,
    initiativeRun({ branch: INITIATIVE_BRANCH }),
    closeoutOutput(OUTSIDE_SCOPE_DELIVERY, "PASS"),
  );

  // Assert
  expect(record.validationErrors.join("\n")).toContain("lint failed");
});

test("a project switched off the initiative's branch keeps its board edits uncommitted rather than commit them elsewhere", async () => {
  // Arrange — someone checked the base branch back out while the run was closing.
  const project = await makeProject();
  await writeTaskBoard(project);
  await ensureProjectDataDir(project);
  await initGitRepository(project.root);
  await commitEverything(project.root, "Initial");

  // Act
  const { record } = await applyCloseoutReport(
    project,
    initiativeRun({ branch: INITIATIVE_BRANCH }),
    closeoutOutput(OUTSIDE_SCOPE_DELIVERY, "PASS"),
  );

  // Assert
  expect(record.validationErrors.join("\n")).toContain(INITIATIVE_BRANCH.name);
  expect(await fileAt(project.root, "HEAD", ".tasks/BACKLOG.md")).not.toContain("Index the archive");
});

// A plain `git commit` records the whole index, so a half-done change someone had
// staged would ship inside Isotopy's board commit when the branch is merged.
test("work already staged before the closeout keeps the board edits uncommitted rather than ride along", async () => {
  // Arrange
  const project = await makeProject();
  await writeTaskBoard(project);
  await ensureProjectDataDir(project);
  await initGitRepository(project.root);
  await commitEverything(project.root, "Initial");
  await switchToNewBranch(project.root, INITIATIVE_BRANCH.name);
  await stageFile(project.root, "src/app.ts", "export const halfDone = true;\n");

  // Act
  const { record } = await applyCloseoutReport(
    project,
    initiativeRun({ branch: INITIATIVE_BRANCH }),
    closeoutOutput(OUTSIDE_SCOPE_DELIVERY, "PASS"),
  );

  // Assert
  expect(record.validationErrors.join("\n")).toContain("staged");
  expect(await fileAt(project.root, "HEAD", ".tasks/BACKLOG.md")).not.toContain("Index the archive");
  expect(await dirtyPaths(project.root)).toContain("src/app.ts");
});

test("board edits someone left uncommitted before the closeout keep it from committing the board", async () => {
  // Arrange
  const project = await makeProject();
  await writeTaskBoard(project);
  await ensureProjectDataDir(project);
  await initGitRepository(project.root);
  await commitEverything(project.root, "Initial");
  await switchToNewBranch(project.root, INITIATIVE_BRANCH.name);
  await writeFile(path.join(project.root, ".tasks", "NOTES.md"), "The owner's draft\n");

  // Act
  const { record } = await applyCloseoutReport(
    project,
    initiativeRun({ branch: INITIATIVE_BRANCH }),
    closeoutOutput(OUTSIDE_SCOPE_DELIVERY, "PASS"),
  );

  // Assert
  expect(record.validationErrors.join("\n")).toContain("uncommitted edits");
  expect(await fileAt(project.root, "HEAD", ".tasks/BACKLOG.md")).not.toContain("Index the archive");
});

test("an initiative's blocking finding is carried to its next run; only work outside it and the owner's calls are filed", async () => {
  // Arrange
  const project = await makeProject();
  await writeTaskBoard(project);
  const report = {
    ...PARTIAL_DELIVERY,
    findings: [
      { id: "gateway-tests-missing", title: "No gateway tests", severity: "blocking" },
      { id: "postgres-down", title: "Cap tests never ran", severity: "blocking" },
      { id: "invite-race", title: "Invite codes can be redeemed twice", severity: "non_blocking" },
    ],
    tasks: [
      followUp({ findingId: "gateway-tests-missing", title: "Add the gateway tests" }),
      followUp({ findingId: "postgres-down", title: "Start Postgres", assignee: "owner" }),
      followUp({ findingId: "invite-race", title: "Redeem invite codes atomically" }),
    ],
  };

  // Act
  const { record } = await applyCloseoutReport(project, initiativeRun(), closeoutOutput(report, "FAIL"));

  // Assert
  expect(record.createdTasks.map((task) => task.title)).toEqual([
    "Start Postgres",
    "Redeem invite codes atomically",
  ]);
  expect(record.report.findings.map((finding) => finding.id)).toContain("gateway-tests-missing");
});

/** An empty project root, swept by the afterEach above. */
async function makeProject(): Promise<ProjectPath> {
  const root = await mkdtemp(path.join(os.tmpdir(), "isotopy-closeout-"));
  roots.push(root);
  return { id: "project", root, dataDir: path.join(root, ".isotopy") };
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
    agents: new Map(),
  });
}

const INITIATIVE_BRANCH: RunBranch = { name: "isotopy/abc12345", base: "main" };

/** Delivers TASK-001 and leaves one problem the initiative's goal does not cover. */
const OUTSIDE_SCOPE_DELIVERY = {
  ...PARTIAL_DELIVERY,
  findings: [{ id: "archive-slow", title: "The archive is slow", severity: "non_blocking" }],
  tasks: [{ ...PARTIAL_DELIVERY.tasks[0], findingId: "archive-slow", title: "Index the archive" }],
  completedTaskIds: ["TASK-001"],
  unresolvedTaskIds: ["TASK-002"],
};

function initiativeRun(overrides: Partial<RunState> = {}): RunState {
  return {
    ...createInitialRunState({
      runId: "run-003",
      number: 3,
      projectId: "project",
      pipeline: FULL_DELIVERY_PIPELINE,
      orchestrationId: "abc12345",
      sourceTaskIds: ["TASK-001", "TASK-002"],
      agents: new Map(),
    }),
    ...overrides,
  };
}

function followUp(overrides: Partial<FollowUpTaskDraft>): FollowUpTaskDraft {
  return {
    findingId: overrides.findingId ?? "finding",
    title: overrides.title ?? "Follow-up",
    description: overrides.description ?? "Decision-complete work.",
    priority: overrides.priority ?? "P2",
    tags: overrides.tags ?? ["server"],
    assignee: overrides.assignee,
  };
}

function markedDelivery(): object {
  return {
    ...PARTIAL_DELIVERY,
    tasks: [{ ...PARTIAL_DELIVERY.tasks[0], assignee: "owner" }],
    completedTaskIds: [],
    unresolvedTaskIds: ["TASK-001", "TASK-002"],
  };
}

function closeoutOutput(report: object, verdict: "PASS" | "FAIL"): string {
  return `\`\`\`isotopy-closeout\n${JSON.stringify(report)}\n\`\`\`\n\nVERDICT: ${verdict}`;
}

const COMPOSED_CLOSEOUT_STAGE: StageDefinition = {
  id: "wrap-up",
  label: "Closing out",
  skill: "orchestrator",
  stepTask: "closeout-feature",
};

function makeComposedTeamRun() {
  return createInitialRunState({
    runId: "run-002",
    number: 2,
    projectId: "project",
    pipeline: {
      id: "team-abc123-1",
      name: "Delivery pair",
      description: "A team the Orchestrator composed for this run.",
      groups: [{ stages: [COMPOSED_CLOSEOUT_STAGE] }],
    },
    sourceTaskIds: ["TASK-001", "TASK-002"],
    agents: new Map(),
  });
}

function registryFor(project: ProjectPath): ProjectRegistry {
  return { resolve: () => project } as unknown as ProjectRegistry;
}

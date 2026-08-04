import { access, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { FULL_DELIVERY_PIPELINE, createInitialRunState } from "@adhd/core";
import type { ProjectPath } from "../../src/paths.ts";
import { applyProductManagerCloseout } from "../../src/services/product-manager-closeout.ts";

const roots: string[] = [];

async function fixture(): Promise<{ project: ProjectPath; run: ReturnType<typeof createInitialRunState> }> {
  const root = await mkdtemp(path.join(os.tmpdir(), "adhd-closeout-"));
  roots.push(root);
  const dataDir = path.join(root, ".adhd");
  const tasksDir = path.join(root, ".tasks");
  await mkdir(tasksDir, { recursive: true });
  await writeFile(
    path.join(tasksDir, "config.json"),
    `${JSON.stringify({
      idPrefix: "TASK",
      nextId: 3,
      states: [
        { name: "Backlog", fileName: "BACKLOG.md" },
        { name: "In Progress", fileName: "IN_PROGRESS.md" },
        { name: "Done", fileName: "DONE.md" },
      ],
      tags: ["server"],
      insertPosition: "top",
    }, null, 2)}\n`,
  );
  await writeFile(path.join(tasksDir, "BACKLOG.md"), "# Backlog\n");
  await writeFile(
    path.join(tasksDir, "IN_PROGRESS.md"),
    "# In Progress\n\n## TASK-001: Delivered work\n**Priority:** P0\n\nDone.\n\n---\n\n## TASK-002: Unresolved work\n**Priority:** P1\n\nStill open.\n\n---\n",
  );
  await writeFile(path.join(tasksDir, "DONE.md"), "# Done\n");
  const run = createInitialRunState({
    runId: "run-001",
    number: 1,
    projectId: "project",
    pipeline: FULL_DELIVERY_PIPELINE,
    milestoneId: "milestone",
    featureId: "feature",
    sourceTaskIds: ["TASK-001", "TASK-002"],
  });
  await mkdir(
    path.join(dataDir, "runs", run.id, "tmp", "browser-profile"),
    { recursive: true },
  );
  await writeFile(path.join(root, "user-work.txt"), "preserve");
  return {
    project: { id: "project", root, dataDir },
    run,
  };
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) =>
      rm(root, { recursive: true, force: true, maxRetries: 5 }),
    ),
  );
});

/** A report that delivers TASK-001, leaves TASK-002 open, and asks for two cleanups. */
function partialDeliveryReport() {
  return {
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
        {
          relativePath: "browser-profile",
          reason: "Run-owned browser profile",
        },
        {
          relativePath: "../user-work.txt",
          reason: "Must be rejected",
        },
      ],
      nextRecommendation: "Resolve TASK-002",
  };
}

function closeoutOutput(report: object, verdict: "PASS" | "FAIL"): string {
  return `\`\`\`adhd-closeout\n${JSON.stringify(report)}\n\`\`\`\n\nVERDICT: ${verdict}`;
}

test("only the tasks the report calls completed move to Done", async () => {
  // Arrange
  const { project, run } = await fixture();

  // Act
  const record = await applyProductManagerCloseout(
    project,
    run,
    closeoutOutput(partialDeliveryReport(), "FAIL"),
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
  // Arrange
  const { project, run } = await fixture();

  // Act
  const record = await applyProductManagerCloseout(
    project,
    run,
    closeoutOutput(partialDeliveryReport(), "FAIL"),
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
  const { project, run } = await fixture();
  const output = closeoutOutput(partialDeliveryReport(), "FAIL");
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
  const { project, run } = await fixture();
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
  const record = await applyProductManagerCloseout(
    project,
    run,
    closeoutOutput(report, "PASS"),
  );

  // Assert — the agent boundary normalises the prose the model wrote.
  expect(record.validationErrors).toEqual([]);
  expect(record.report.findings).toMatchObject([{ severity: "non_blocking" }]);
  expect(record.createdTasks).toMatchObject([{ id: "TASK-003", backend: "taskplanner" }]);
  expect(
    await readFile(path.join(project.root, ".tasks", "BACKLOG.md"), "utf8"),
  ).toContain("Fix the dashboard spacing");
});

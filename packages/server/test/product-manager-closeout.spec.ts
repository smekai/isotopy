import { access, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FULL_DELIVERY_PIPELINE, createInitialRunState } from "@adhd/core";
import type { ProjectPath } from "../src/paths.ts";
import { applyProductManagerCloseout } from "../src/services/product-manager-closeout.ts";

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

describe("Product Manager closeout", () => {
  it("moves only completed work, deduplicates follow-ups, and bounds cleanup", async () => {
    const { project, run } = await fixture();
    const report = {
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
    const output = `\`\`\`adhd-closeout\n${JSON.stringify(report)}\n\`\`\`\n\nVERDICT: FAIL`;

    const first = await applyProductManagerCloseout(project, run, output);
    const second = await applyProductManagerCloseout(project, run, output);

    expect(first.validationErrors).toEqual([]);
    expect(first.createdTasks).toMatchObject([
      { id: "TASK-003", backend: "taskplanner" },
    ]);
    expect(first.cleanup).toEqual({
      removed: ["browser-profile"],
      rejected: ["../user-work.txt"],
    });
    expect(second.createdTasks).toEqual([]);
    expect(await readFile(path.join(rootOf(project), ".tasks", "DONE.md"), "utf8"))
      .toContain("## TASK-001:");
    expect(
      await readFile(path.join(rootOf(project), ".tasks", "IN_PROGRESS.md"), "utf8"),
    ).toContain("## TASK-002:");
    const backlog = await readFile(
      path.join(rootOf(project), ".tasks", "BACKLOG.md"),
      "utf8",
    );
    expect(backlog.match(/ADHD-FINDING:/g)).toHaveLength(1);
    await expect(
      access(path.join(project.dataDir, "runs", run.id, "tmp", "browser-profile")),
    ).rejects.toThrow();
    expect(await readFile(path.join(rootOf(project), "user-work.txt"), "utf8"))
      .toBe("preserve");
    expect(
      await readFile(
        path.join(project.dataDir, "runs", run.id, "closeout", "closeout.md"),
        "utf8",
      ),
    ).toContain("# Product Manager closeout");
  });
});

function rootOf(project: ProjectPath): string {
  return project.root;
}

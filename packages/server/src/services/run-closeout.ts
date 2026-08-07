import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  CleanupResult,
  ProductManagerCloseout,
  RunArtifactRecord,
  RunCloseoutRecord,
  RunState,
} from "@adhd/core";
import {
  parseProductManagerCloseout,
  validateSourceTaskOutcome,
} from "../domain/rules/closeout.ts";
import {
  renderCancelledCleanupReport,
  renderCleanupReport,
  renderCloseout,
  renderRunArtifacts,
} from "../domain/markdown/closeout.ts";
import { runsDir } from "../paths.ts";
import type { ProjectPath } from "../paths.ts";
import { nowIso } from "../utils/time.ts";
import { taskBoardFor } from "./task-board-adapter.ts";

export async function applyProductManagerCloseout(
  projectPath: ProjectPath,
  run: RunState,
  output: string,
): Promise<RunCloseoutRecord> {
  const parsed = parseProductManagerCloseout(output);
  const validationErrors = [
    ...parsed.validationErrors,
    ...validateSourceTaskOutcome(run, parsed.report),
  ];
  const taskBoard = taskBoardFor(projectPath);
  const createdTasks = await taskBoard
    .createFollowUpTasks(run, parsed.report.tasks)
    .catch((error: unknown) => {
      validationErrors.push(
        `Task creation failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    });
  await taskBoard
    .transitionTasks(parsed.report.completedTaskIds, "Done", run.id)
    .catch((error: unknown) => {
      validationErrors.push(
        `Task transition failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  const cleanup = await cleanupRunTemp(
    projectPath,
    run.id,
    parsed.report,
  ).catch((error: unknown) => {
    validationErrors.push(
      `Cleanup failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return {
      removed: [],
      rejected: parsed.report.cleanup.map((item) => item.relativePath),
    };
  });
  const record: RunCloseoutRecord = {
    report: parsed.report,
    createdTasks,
    cleanup,
    validationErrors,
    completedAt: nowIso(),
  };
  await persistRunCloseout(projectPath, run, record);
  return record;
}

export async function persistRunArtifacts(
  projectPath: ProjectPath,
  runId: string,
  record: RunArtifactRecord,
): Promise<void> {
  const artifactsDir = path.join(runsDir(projectPath), runId, "artifacts");
  await mkdir(artifactsDir, { recursive: true });
  await Promise.all([
    writeFile(
      path.join(artifactsDir, "artifacts.json"),
      `${JSON.stringify(record, null, 2)}\n`,
    ),
    writeFile(
      path.join(artifactsDir, "artifacts.md"),
      renderRunArtifacts(record.report),
    ),
  ]);
}

export async function cleanupCancelledRun(
  projectPath: ProjectPath,
  runId: string,
): Promise<void> {
  const tempRoot = path.join(runsDir(projectPath), runId, "tmp");
  await rm(tempRoot, { recursive: true, force: true, maxRetries: 3 });
  const closeoutDir = path.join(runsDir(projectPath), runId, "closeout");
  await mkdir(closeoutDir, { recursive: true });
  await writeFile(
    path.join(closeoutDir, "cleanup-report.md"),
    renderCancelledCleanupReport(),
  );
}

async function cleanupRunTemp(
  projectPath: ProjectPath,
  runId: string,
  report: ProductManagerCloseout,
): Promise<CleanupResult> {
  const tempRoot = path.resolve(runsDir(projectPath), runId, "tmp");
  const removed: string[] = [];
  const rejected: string[] = [];
  for (const candidate of report.cleanup) {
    const relative = candidate.relativePath;
    const allowed =
      relative === "." ||
      (!path.isAbsolute(relative) &&
        relative !== "" &&
        relative !== ".." &&
        path.basename(relative) === relative);
    if (!allowed) {
      rejected.push(relative);
      continue;
    }
    const target = relative === "." ? tempRoot : path.join(tempRoot, relative);
    if (target !== tempRoot && !target.startsWith(`${tempRoot}${path.sep}`)) {
      rejected.push(relative);
      continue;
    }
    await rm(target, { recursive: true, force: true, maxRetries: 3 });
    removed.push(relative);
  }
  return { removed, rejected };
}

async function persistRunCloseout(
  projectPath: ProjectPath,
  run: RunState,
  record: RunCloseoutRecord,
): Promise<void> {
  const closeoutDir = path.join(runsDir(projectPath), run.id, "closeout");
  await mkdir(closeoutDir, { recursive: true });
  await Promise.all([
    writeFile(
      path.join(closeoutDir, "closeout.json"),
      `${JSON.stringify(record, null, 2)}\n`,
    ),
    writeFile(
      path.join(closeoutDir, "closeout.md"),
      renderCloseout(record.report),
    ),
    writeFile(
      path.join(closeoutDir, "cleanup-report.md"),
      renderCleanupReport(record.cleanup),
    ),
  ]);

  if (run.milestoneId) {
    const milestoneRunsDir = path.join(
      projectPath.dataDir,
      "milestones",
      run.milestoneId,
      "runs",
    );
    await mkdir(milestoneRunsDir, { recursive: true });
    await Promise.all([
      writeFile(
        path.join(milestoneRunsDir, `${run.id}.json`),
        `${JSON.stringify(record, null, 2)}\n`,
      ),
      writeFile(
        path.join(milestoneRunsDir, `${run.id}.md`),
        renderCloseout(record.report),
      ),
    ]);
  }
}

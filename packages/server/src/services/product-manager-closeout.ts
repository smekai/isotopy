import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  CleanupResult,
  Milestone,
  ProductManagerCloseout,
  RunArtifactRecord,
  RunArtifacts,
  RunCloseoutRecord,
  RunState,
} from "@adhd/core";
import { parseProductManagerCloseout } from "../domain/rules/closeout.ts";
import {
  renderCancelledCleanupReport,
  renderCleanupReport,
  renderCloseout,
  renderMilestoneSummary,
  renderRunArtifacts,
} from "../domain/markdown/closeout.ts";
import { renderPriorMilestoneCloseouts } from "../domain/markdown/planning.ts";
import { parseMilestoneSummary } from "../domain/codecs/milestone-summary.ts";
import { runsDir } from "../paths.ts";
import type { ProjectPath } from "../paths.ts";
import { nowIso } from "../utils/time.ts";
import {
  createFollowUpTasks,
  transitionTasks,
} from "./task-board-adapter.ts";

function validateSourceTaskOutcome(
  run: RunState,
  report: ProductManagerCloseout,
): string[] {
  const sourceIds = new Set(run.sourceTaskIds ?? []);
  const reportedIds = [
    ...report.completedTaskIds,
    ...report.unresolvedTaskIds,
  ];
  const unknown = reportedIds.filter((id) => !sourceIds.has(id));
  const completed = report.completedTaskIds.filter((id) => sourceIds.has(id));
  const unresolved = report.unresolvedTaskIds.filter((id) => sourceIds.has(id));
  const overlap = completed.filter((id) => unresolved.includes(id));
  const declared = new Set([...completed, ...unresolved]);
  const omitted = [...sourceIds].filter((id) => !declared.has(id));
  report.completedTaskIds = completed.filter((id) => !overlap.includes(id));
  report.unresolvedTaskIds = [
    ...new Set([...unresolved, ...overlap, ...omitted]),
  ];
  const errors: string[] = [];
  if (overlap.length > 0) {
    errors.push(
      `Tasks cannot be both completed and unresolved: ${overlap.join(", ")}`,
    );
  }
  if (unknown.length > 0) {
    errors.push(`Closeout referenced unknown source tasks: ${unknown.join(", ")}`);
  }
  if (omitted.length > 0) {
    errors.push(
      `Unclassified source tasks were preserved as unresolved: ${omitted.join(", ")}`,
    );
  }
  return errors;
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
  const createdTasks = await createFollowUpTasks(
    projectPath,
    run,
    parsed.report.tasks,
  ).catch((error: unknown) => {
    validationErrors.push(
      `Task creation failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return [];
  });
  await transitionTasks(
    projectPath,
    parsed.report.completedTaskIds,
    "Done",
    run.id,
  ).catch((error: unknown) => {
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

function milestoneReportOf(run: RunState): RunArtifacts | undefined {
  return run.closeout?.report ?? run.artifacts?.report;
}

export async function persistMilestoneSummary(
  projectPath: ProjectPath,
  milestone: Milestone,
  runs: RunState[],
): Promise<void> {
  const linked = runs.filter((run) => run.milestoneId === milestone.id);
  const records = linked.flatMap((run) => {
    const report = milestoneReportOf(run);
    return report ? [{ run, report }] : [];
  });
  const cleanups = linked.flatMap((run) => (run.closeout ? [run.closeout.cleanup] : []));
  const unique = (values: string[]) => [...new Set(values)];
  const summary = {
    milestoneId: milestone.id,
    name: milestone.name,
    goal: milestone.goal,
    completedAt: milestone.completedAt,
    decisions: unique(records.flatMap(({ report }) => report.decisions)),
    knowledge: unique(records.flatMap(({ report }) => report.knowledge)),
    openProblems: records.flatMap(({ run, report }) =>
      report.findings.map((finding) => ({ ...finding, sourceRunId: run.id })),
    ),
    cleanup: {
      removed: unique(cleanups.flatMap((cleanup) => cleanup.removed)),
      rejected: unique(cleanups.flatMap((cleanup) => cleanup.rejected)),
    },
  };
  const dir = path.join(projectPath.dataDir, "milestones", milestone.id);
  await mkdir(dir, { recursive: true });
  await Promise.all([
    writeFile(
      path.join(dir, "summary.json"),
      `${JSON.stringify(summary, null, 2)}\n`,
    ),
    writeFile(
      path.join(dir, "summary.md"),
      renderMilestoneSummary({
        name: milestone.name,
        goal: milestone.goal,
        runCount: linked.length,
        featureCount: milestone.features.length,
        decisions: summary.decisions,
        knowledge: summary.knowledge,
        openProblems: summary.openProblems,
      }),
    ),
  ]);
}

export async function milestoneCloseoutContext(
  projectPath: ProjectPath,
): Promise<string> {
  const root = path.join(projectPath.dataDir, "milestones");
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const summaries = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const content = await readFile(
          path.join(root, entry.name, "summary.json"),
          "utf8",
        ).catch(() => undefined);
        if (!content) return undefined;
        return parseMilestoneSummary(content);
      }),
  );
  const valid = summaries.filter(
    (summary): summary is NonNullable<typeof summary> => summary !== undefined,
  );
  return renderPriorMilestoneCloseouts(valid);
}

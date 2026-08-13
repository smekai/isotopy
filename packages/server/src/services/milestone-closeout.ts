import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Milestone, RunArtifacts, RunState } from "@isotopy/core";
import { renderMilestoneSummary } from "../domain/markdown/closeout.ts";
import { renderPriorMilestoneCloseouts } from "../domain/markdown/planning.ts";
import { parseMilestoneSummary } from "../schemas/milestone-summary.ts";
import type { ProjectPath } from "../paths.ts";

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

function milestoneReportOf(run: RunState): RunArtifacts | undefined {
  return run.closeout?.report ?? run.artifacts?.report;
}

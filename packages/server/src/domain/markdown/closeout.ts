import type {
  CleanupResult,
  ProductManagerCloseout,
} from "@adhd/core";
import {
  bullet,
  markdownBlocks,
  markdownBody,
  structuralText,
} from "./format.ts";

export interface MilestoneSummaryDocument {
  name: string;
  goal?: string;
  runCount: number;
  featureCount: number;
  decisions: string[];
  knowledge: string[];
  openProblems: MilestoneSummaryProblem[];
}

export interface MilestoneSummaryProblem {
  title: string;
  sourceRunId: string;
}

function listSection(title: string, items: string[]): string | undefined {
  return items.length > 0
    ? `## ${title}\n\n${items.map(bullet).join("\n")}`
    : undefined;
}

export function renderCloseout(report: ProductManagerCloseout): string {
  const findings =
    report.findings.length > 0
      ? `## Findings\n\n${report.findings
          .map((finding) => {
            const label =
              finding.severity === "blocking" ? "Blocking" : "Non-blocking";
            const content = `**${label} · ${structuralText(finding.title)}**${
              finding.evidence
                ? ` — ${markdownBody(finding.evidence)}`
                : ""
            }`;
            return bullet(content);
          })
          .join("\n")}`
      : undefined;
  return markdownBlocks(
    [
      "# Product Manager closeout",
      markdownBody(report.summary),
      listSection("Delivered scope", report.deliveredScope),
      listSection("Completed source tasks", report.completedTaskIds),
      listSection("Unresolved source tasks", report.unresolvedTaskIds),
      listSection("Decisions", report.decisions),
      listSection("Knowledge", report.knowledge),
      findings,
      report.nextRecommendation
        ? `## Next recommendation\n\n${markdownBody(report.nextRecommendation)}`
        : undefined,
    ],
    true,
  );
}

export function renderCleanupReport(cleanup: CleanupResult): string {
  const entries = [
    ...cleanup.removed.map(
      (entry) => `Removed \`${structuralText(entry)}\``,
    ),
    ...cleanup.rejected.map(
      (entry) => `Rejected \`${structuralText(entry)}\``,
    ),
  ];
  return markdownBlocks(
    [
      "# Cleanup report",
      entries.length > 0
        ? entries.map(bullet).join("\n")
        : "No cleanup paths were requested.",
    ],
    true,
  );
}

export function renderCancelledCleanupReport(): string {
  return markdownBlocks(
    [
      "# Cleanup report",
      "Removed the run-owned temporary directory after cancellation. No closeout agent was started.",
    ],
    true,
  );
}

export function renderMilestoneSummary(
  summary: MilestoneSummaryDocument,
): string {
  return markdownBlocks(
    [
      `# ${structuralText(summary.name)} — milestone summary`,
      summary.goal ? markdownBody(summary.goal) : undefined,
      `Runs: ${summary.runCount}\nFeatures: ${summary.featureCount}`,
      listSection("Decisions", summary.decisions),
      listSection("Knowledge", summary.knowledge),
      listSection(
        "Open problems",
        summary.openProblems.map(
          (item) =>
            `${structuralText(item.title)} (run ${structuralText(item.sourceRunId)})`,
        ),
      ),
    ],
    true,
  );
}

import type {
  CleanupResult,
  CloseoutFinding,
  ProductManagerCloseout,
  RunArtifacts,
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

function findingsSection(findings: CloseoutFinding[]): string | undefined {
  if (findings.length === 0) {
    return undefined;
  }
  const entries = findings.map((finding) => {
    const label = finding.severity === "blocking" ? "Blocking" : "Non-blocking";
    const evidence = finding.evidence ? ` — ${markdownBody(finding.evidence)}` : "";
    return bullet(`**${label} · ${structuralText(finding.title)}**${evidence}`);
  });
  return `## Findings\n\n${entries.join("\n")}`;
}

function recommendationSection(recommendation?: string): string | undefined {
  return recommendation
    ? `## Next recommendation\n\n${markdownBody(recommendation)}`
    : undefined;
}

export function renderCloseout(report: ProductManagerCloseout): string {
  return markdownBlocks(
    [
      "# Product Manager closeout",
      markdownBody(report.summary),
      listSection("Delivered scope", report.deliveredScope),
      listSection("Completed source tasks", report.completedTaskIds),
      listSection("Unresolved source tasks", report.unresolvedTaskIds),
      listSection("Decisions", report.decisions),
      listSection("Knowledge", report.knowledge),
      findingsSection(report.findings),
      recommendationSection(report.nextRecommendation),
    ],
    true,
  );
}

export function renderRunArtifacts(report: RunArtifacts): string {
  return markdownBlocks(
    [
      "# Orchestrator run artifacts",
      markdownBody(report.summary),
      listSection("Delivered scope", report.deliveredScope),
      listSection("Decisions", report.decisions),
      listSection("Knowledge", report.knowledge),
      findingsSection(report.findings),
      recommendationSection(report.nextRecommendation),
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

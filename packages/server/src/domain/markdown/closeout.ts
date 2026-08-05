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

export type HeadingLevel = "##" | "###" | "####";

const DOCUMENT_LEVEL: HeadingLevel = "##";

function listSection(
  level: HeadingLevel,
  title: string,
  items: string[],
): string | undefined {
  return items.length > 0
    ? `${level} ${title}\n\n${items.map(bullet).join("\n")}`
    : undefined;
}

function findingsSection(
  level: HeadingLevel,
  findings: CloseoutFinding[],
): string | undefined {
  if (findings.length === 0) {
    return undefined;
  }
  const entries = findings.map((finding) => {
    const label = finding.severity === "blocking" ? "Blocking" : "Non-blocking";
    const evidence = finding.evidence ? ` — ${markdownBody(finding.evidence)}` : "";
    return bullet(`**${label} · ${structuralText(finding.title)}**${evidence}`);
  });
  return `${level} Findings\n\n${entries.join("\n")}`;
}

function recommendationSection(
  level: HeadingLevel,
  recommendation?: string,
): string | undefined {
  return recommendation
    ? `${level} Next recommendation\n\n${markdownBody(recommendation)}`
    : undefined;
}

function closeoutSections(
  report: ProductManagerCloseout,
  level: HeadingLevel,
): Array<string | undefined> {
  return [
    markdownBody(report.summary),
    listSection(level, "Delivered scope", report.deliveredScope),
    listSection(level, "Completed source tasks", report.completedTaskIds),
    listSection(level, "Unresolved source tasks", report.unresolvedTaskIds),
    listSection(level, "Decisions", report.decisions),
    listSection(level, "Knowledge", report.knowledge),
    findingsSection(level, report.findings),
    recommendationSection(level, report.nextRecommendation),
  ];
}

function artifactSections(
  report: RunArtifacts,
  level: HeadingLevel,
): Array<string | undefined> {
  return [
    markdownBody(report.summary),
    listSection(level, "Delivered scope", report.deliveredScope),
    listSection(level, "Decisions", report.decisions),
    listSection(level, "Knowledge", report.knowledge),
    findingsSection(level, report.findings),
    recommendationSection(level, report.nextRecommendation),
  ];
}

export function renderCloseout(report: ProductManagerCloseout): string {
  return markdownBlocks(
    ["# Product Manager closeout", ...closeoutSections(report, DOCUMENT_LEVEL)],
    true,
  );
}

export function renderCloseoutBody(
  report: ProductManagerCloseout,
  level: HeadingLevel,
): string {
  return markdownBlocks(closeoutSections(report, level));
}

export function renderRunArtifacts(report: RunArtifacts): string {
  return markdownBlocks(
    ["# Orchestrator run artifacts", ...artifactSections(report, DOCUMENT_LEVEL)],
    true,
  );
}

export function renderRunArtifactsBody(
  report: RunArtifacts,
  level: HeadingLevel,
): string {
  return markdownBlocks(artifactSections(report, level));
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
      listSection(DOCUMENT_LEVEL, "Decisions", summary.decisions),
      listSection(DOCUMENT_LEVEL, "Knowledge", summary.knowledge),
      listSection(
        DOCUMENT_LEVEL,
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

import type { RunArtifacts } from "@isotopy/core";
import type { CategoryCount } from "../rules/pull-request-release.ts";
import { bullet, markdownBlocks, markdownBody, structuralText } from "./format.ts";

export type PreviewNote = { kind: "deployed"; url: string } | { kind: "failed"; reason: string };

export interface PullRequestBody {
  goal: string;
  summary?: string;
  closeout?: RunArtifacts;
  preview?: PreviewNote;
  counts: CategoryCount[];
}

function listSection(title: string, items: string[]): string | undefined {
  return items.length === 0 ? undefined : `## ${title}\n\n${items.map(bullet).join("\n")}`;
}

function openFindings(closeout: RunArtifacts | undefined): string[] {
  return (closeout?.findings ?? []).map(
    (finding) => `**${finding.severity}** — ${structuralText(finding.title)}`,
  );
}

function previewSection(preview: PreviewNote | undefined): string | undefined {
  if (preview === undefined) {
    return undefined;
  }
  return preview.kind === "deployed"
    ? `## Preview\n\n${structuralText(preview.url)}`
    : `## Preview\n\nThe preview deployment failed: ${structuralText(preview.reason)}`;
}

function changeTable(counts: CategoryCount[]): string {
  const rows = counts.map(
    ({ category, files, added, removed }) => `| ${category} | ${files} | ${added} | ${removed} |`,
  );
  const code = counts.filter(({ category }) => category === "Source" || category === "Tests");
  const prose = counts.filter(({ category }) => category === "Task board" || category === "Docs");
  const total = (entries: CategoryCount[]) =>
    entries.reduce((sum, { added, removed }) => sum + added + removed, 0);
  return [
    "## Lines changed",
    ["| Category | Files | Added | Removed |", "| --- | ---: | ---: | ---: |", ...rows].join("\n"),
    `Code (source + tests): ${total(code)} lines · prose (task board + docs): ${total(prose)} lines`,
  ].join("\n\n");
}

export function renderPullRequestBody(body: PullRequestBody): string {
  return markdownBlocks(
    [
      `## Goal\n\n${markdownBody(body.goal)}`,
      body.summary === undefined ? undefined : `## Summary\n\n${markdownBody(body.summary)}`,
      body.closeout === undefined ? undefined : markdownBody(body.closeout.summary),
      listSection("Delivered scope", body.closeout?.deliveredScope ?? []),
      listSection("Open findings", openFindings(body.closeout)),
      previewSection(body.preview),
      changeTable(body.counts),
      "Opened by Isotopy. The team committed this work; only Isotopy pushes.",
    ],
    true,
  );
}

export interface FailingCheck {
  name: string;
  link: string;
  log?: string;
}

export function renderFailingChecks(url: string, checks: FailingCheck[]): string {
  return markdownBlocks(
    [
      `# CI failed on ${structuralText(url)}`,
      "The pull request stays open. Fix what these checks report and commit on the same branch; " +
        "Isotopy pushes the fix and waits for CI again.",
      ...checks.map((check) =>
        markdownBlocks([
          `## ${structuralText(check.name)}`,
          check.link === "" ? undefined : structuralText(check.link),
          check.log === undefined ? undefined : `\`\`\`text\n${markdownBody(check.log)}\n\`\`\``,
        ]),
      ),
    ],
    true,
  );
}

export function renderChecksTimedOut(url: string, minutes: number): string {
  return markdownBlocks(
    [
      `# CI did not settle on ${structuralText(url)}`,
      `The required checks were still running after ${minutes} minutes. The pull request stays open.`,
    ],
    true,
  );
}

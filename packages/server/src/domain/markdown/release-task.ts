import type { RunArtifacts } from "@isotopy/core";
import { bullet, markdownBlocks, markdownBody, structuralText } from "./format.ts";

export interface ReleaseContext {
  goal: string;
  summary?: string;
  closeout?: RunArtifacts;
}

function listSection(title: string, items: string[]): string | undefined {
  return items.length === 0 ? undefined : `## ${title}\n\n${items.map(bullet).join("\n")}`;
}

function openFindings(closeout: RunArtifacts | undefined): string[] {
  return (closeout?.findings ?? []).map(
    (finding) => `**${finding.severity}** — ${structuralText(finding.title)}`,
  );
}

export function renderReleaseTask(context: ReleaseContext): string {
  return markdownBlocks([
    "Release this initiative through a pull request.",
    `## Goal\n\n${markdownBody(context.goal)}`,
    context.summary === undefined ? undefined : `## Why it is ready\n\n${markdownBody(context.summary)}`,
    context.closeout === undefined ? undefined : `## Closeout\n\n${markdownBody(context.closeout.summary)}`,
    listSection("Delivered scope", context.closeout?.deliveredScope ?? []),
    listSection("Open findings", openFindings(context.closeout)),
  ]);
}

import type { MilestoneProposal } from "@adhd/core";
import type { MilestoneSummaryContext } from "../codecs/milestone-summary.ts";
import {
  bullet,
  markdownBlocks,
  markdownBody,
  structuralText,
} from "./format.ts";

export interface MilestoneKnowledge {
  name: string;
  findings: string[];
}

export function renderMilestoneRevisionContext(
  originalGoal: string,
  proposal: MilestoneProposal | undefined,
  feedback: string,
): string {
  return markdownBlocks([
    `## Original milestone goal\n\n${markdownBody(originalGoal)}`,
    proposal
      ? `## Current proposal\n\n\`\`\`json\n${JSON.stringify(proposal, null, 2)}\n\`\`\``
      : undefined,
    `## User revision request\n\n${markdownBody(feedback)}`,
  ]);
}

export function renderPriorMilestoneCloseouts(
  summaries: MilestoneSummaryContext[],
): string {
  if (summaries.length === 0) {
    return "No prior milestone closeout knowledge is available.";
  }
  return markdownBlocks([
    "## Prior milestone closeouts",
    summaries
      .map((summary) => {
        const details = [
          ...summary.decisions.map((item) => `  - Decision: ${markdownBody(item)}`),
          ...summary.knowledge.map((item) => `  - Knowledge: ${markdownBody(item)}`),
          ...summary.problems.map((item) => `  - Open problem: ${markdownBody(item)}`),
        ];
        return [
          `- ${structuralText(summary.name)}`,
          ...details,
        ].join("\n");
      })
      .join("\n"),
  ]);
}

export function renderMilestonePlanningContext(
  userContext: string,
  boardContext: string,
  storedCloseoutContext: string,
  priorKnowledge: MilestoneKnowledge[],
): string {
  const knowledge =
    priorKnowledge.length > 0
      ? `## Prior milestone knowledge\n\n${priorKnowledge
          .map((milestone) => {
            const findings =
              milestone.findings.length > 0
                ? `: ${milestone.findings.map(structuralText).join("; ")}`
                : "";
            return bullet(`${structuralText(milestone.name)}${findings}`);
          })
          .join("\n")}`
      : undefined;
  return markdownBlocks([
    markdownBody(userContext),
    markdownBody(boardContext),
    markdownBody(storedCloseoutContext),
    knowledge,
  ]);
}

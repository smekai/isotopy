import {
  markdownBlocks,
  markdownBody,
  structuralText,
} from "./format.ts";

export interface UpstreamOutput {
  label: string;
  output: string;
}

export interface HandoffMeta {
  stageLabel: string;
  profession: string;
  engine: string;
  model?: string;
  completedAt: string;
}

const HANDOFF_NOTE =
  "These are reports from the boxes that ran before you, in order. They describe " +
  "intent — the working directory is the source of truth. Verify rather than assume.";

export function buildStagePrompt(
  task: string,
  upstream: UpstreamOutput[],
  stepTask?: string,
): string {
  const reports = upstream.filter((entry) => markdownBody(entry.output) !== "");
  const assignment = stepTask ? markdownBody(stepTask) : "";
  if (reports.length === 0 && assignment === "") {
    return markdownBody(task);
  }
  return markdownBlocks([
    assignment ? `## Step task\n\n${assignment}` : undefined,
    `## Task\n\n${markdownBody(task)}`,
    reports.length > 0
      ? `## Handoff from previous steps\n\n${HANDOFF_NOTE}`
      : undefined,
    ...reports.map(
      (entry) =>
        `### ${structuralText(entry.label)}\n\n${markdownBody(entry.output)}`,
    ),
  ]);
}

export function formatHandoff(meta: HandoffMeta, output: string): string {
  const engine = `${structuralText(meta.engine)}${
    meta.model ? ` · ${structuralText(meta.model)}` : ""
  }`;
  return markdownBlocks(
    [
      `# ${structuralText(meta.stageLabel)} — handoff`,
      [
        `- **Agent:** ${structuralText(meta.profession)}`,
        `- **Engine:** ${engine}`,
        `- **Completed:** ${structuralText(meta.completedAt)}`,
      ].join("\n"),
      "---",
      markdownBody(output),
    ],
    true,
  );
}

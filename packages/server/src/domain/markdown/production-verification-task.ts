import { markdownBlocks, markdownBody } from "./format.ts";

export interface ProductionVerificationContext {
  url?: string;
  ref?: string;
  rollbackRef?: string;
  instructions: string;
}

function deployedLine(label: string, value: string | undefined): string {
  return `- ${label}: ${value === undefined ? "not reported" : `\`${value}\``}`;
}

export function renderProductionVerificationTask(context: ProductionVerificationContext): string {
  return markdownBlocks([
    "Check production right after this deploy. Read only.",
    [
      "## Deployment",
      "",
      deployedLine("URL", context.url),
      deployedLine("Commit now live", context.ref),
      deployedLine("Commit a rollback would return to", context.rollbackRef),
    ].join("\n"),
    `## Project instructions\n\n${markdownBody(context.instructions)}`,
  ]);
}

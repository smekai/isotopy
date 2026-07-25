import type { StageVerdict } from "@adhd/core";
import type { EngineRunResult } from "../engines/types.ts";

export interface UpstreamOutput {
  label: string;
  output: string;
}

const TASK_HEADING = "## Task";

const HANDOFF_HEADING = "## Handoff from previous steps";
const HANDOFF_NOTE =
  "These are reports from the boxes that ran before you, in order. They describe " +
  "intent — the working directory is the source of truth. Verify rather than assume.";

export function buildStagePrompt(task: string, upstream: UpstreamOutput[]): string {
  const reports = upstream.filter((entry) => entry.output.trim() !== "");
  if (reports.length === 0) {
    return task;
  }

  const blocks = reports.map(
    (entry) => `### ${entry.label}\n\n${entry.output.trim()}`,
  );
  return [
    `${TASK_HEADING}\n\n${task}`,
    `${HANDOFF_HEADING}\n\n${HANDOFF_NOTE}`,
    ...blocks,
  ].join("\n\n");
}

const VERDICT_LINE = /^[*`_\s]*VERDICT:\s*(PASS|FAIL)[*`_\s]*$/i;

export function parseStageVerdict(output: string | undefined): StageVerdict | undefined {
  if (!output) {
    return undefined;
  }
  const linesLastFirst = output.split("\n").reverse();
  for (const line of linesLastFirst) {
    const match = VERDICT_LINE.exec(line.replace(/\r$/, "").trim());
    if (match?.[1]) {
      return match[1].toUpperCase() as StageVerdict;
    }
  }
  return undefined;
}

export interface EngineStageOutcome {
  outcome: "passed" | "failed";
  output?: string;
  verdict?: StageVerdict;
  failureMessage?: string;
}

export function interpretEngineResult(
  result: EngineRunResult,
  profession: string,
): EngineStageOutcome {
  if (!result.success) {
    return { outcome: "failed", failureMessage: result.errorMessage ?? `${profession} failed` };
  }
  const output =
    result.result !== undefined && result.result.trim() !== "" ? result.result : undefined;
  const verdict = parseStageVerdict(result.result);
  if (verdict === "FAIL") {
    return {
      outcome: "failed",
      ...(output !== undefined ? { output } : {}),
      verdict,
      failureMessage: `${profession} reported VERDICT: FAIL`,
    };
  }
  return {
    outcome: "passed",
    ...(output !== undefined ? { output } : {}),
    ...(verdict !== undefined ? { verdict } : {}),
  };
}

export interface HandoffMeta {
  stageLabel: string;
  profession: string;
  engine: string;
  model?: string | undefined;
  completedAt: string;
}

export function formatHandoff(meta: HandoffMeta, output: string): string {
  const lines = [
    `# ${meta.stageLabel} — handoff`,
    "",
    `- **Agent:** ${meta.profession}`,
    `- **Engine:** ${meta.engine}${meta.model ? ` · ${meta.model}` : ""}`,
    `- **Completed:** ${meta.completedAt}`,
    "",
    "---",
    "",
    output.trim(),
    "",
  ];
  return lines.join("\n");
}

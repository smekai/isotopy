// Cross-box context, both directions: the prompt a stage receives (what earlier
// boxes reported) and the handoff document it leaves behind — plus reading the
// verdict a verification box declares about itself.
//
// The shared workspace is the real source of truth between boxes — the Tester
// reads the code the Developer actually wrote. These blocks add the missing
// half: what the previous boxes *said* they did, which is not recoverable from
// the files alone. Pure string building, no I/O (see docs/code-quality.md).

import type { StageVerdict } from "@adhd/core";

/** One upstream box's report, in the order the stages ran. */
export interface UpstreamOutput {
  /** Stage label as shown in the UI, e.g. "Developer". */
  label: string;
  /** That stage's final result text. */
  output: string;
}

/** Marks the task the run was started with. */
const TASK_HEADING = "## Task";

/** Introduces upstream reports; the wording tells the model how to weigh them. */
const HANDOFF_HEADING = "## Handoff from previous steps";
const HANDOFF_NOTE =
  "These are reports from the boxes that ran before you, in order. They describe " +
  "intent — the working directory is the source of truth. Verify rather than assume.";

/**
 * Build the prompt for a stage: the run's task, plus a handoff block for every
 * upstream stage that produced output. With no upstream output the task is
 * returned unchanged, so a single-box run's prompt is exactly what the user typed.
 */
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

/**
 * Matches a whole line that is nothing but a verdict, allowing the markdown
 * wrapping real runs produce: bare, backticked, and bold all occur.
 */
const VERDICT_LINE = /^[*`_\s]*VERDICT:\s*(PASS|FAIL)[*`_\s]*$/i;

/**
 * Read a verification box's verdict from its report.
 *
 * Scans **backwards** for the last line that is *only* a verdict. Both matter:
 * the persona text itself contains the literal strings `VERDICT: PASS` and
 * `VERDICT: FAIL`, and a report may discuss one mid-prose ("I would fail this
 * if…") — so a first-match-anywhere search would read the wrong outcome.
 *
 * Returns undefined when the output has no verdict line, which is how stages
 * without a verdict contract (the Developer) stay governed by exit code alone.
 */
export function parseStageVerdict(output: string | undefined): StageVerdict | undefined {
  if (!output) {
    return undefined;
  }
  const lines = output.split("\n");
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    // Engine output can be CRLF-terminated on Windows; strip the CR before matching.
    const match = VERDICT_LINE.exec(lines[i].replace(/\r$/, "").trim());
    if (match?.[1]) {
      return match[1].toUpperCase() as StageVerdict;
    }
  }
  return undefined;
}

/** Provenance recorded at the top of a handoff document. */
export interface HandoffMeta {
  stageLabel: string;
  profession: string;
  engine: string;
  model?: string;
  completedAt: string;
}

/**
 * Render a stage's handoff artifact — the readable record of what one box
 * reported, written next to the run's state and events.
 */
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

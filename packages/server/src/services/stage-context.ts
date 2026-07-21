// Cross-box context, both directions: the prompt a stage receives (what earlier
// boxes reported) and the handoff document it leaves behind.
//
// The shared workspace is the real source of truth between boxes — the Tester
// reads the code the Developer actually wrote. These blocks add the missing
// half: what the previous boxes *said* they did, which is not recoverable from
// the files alone. Pure string building, no I/O (see docs/code-quality.md).

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

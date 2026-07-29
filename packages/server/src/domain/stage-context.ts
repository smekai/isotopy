import { STAGE_OUTCOMES, STAGE_VERDICTS } from "@adhd/core";
import type { StageOutcome, StageVerdict } from "@adhd/core";
import type { EngineRunResult } from "../engines/types.ts";

export interface UpstreamOutput {
  label: string;
  output: string;
}

const TASK_HEADING = "## Task";
const ASSIGNMENT_HEADING = "## Step task";

const HANDOFF_HEADING = "## Handoff from previous steps";
const HANDOFF_NOTE =
  "These are reports from the boxes that ran before you, in order. They describe " +
  "intent — the working directory is the source of truth. Verify rather than assume.";

export function buildStagePrompt(
  task: string,
  upstream: UpstreamOutput[],
  stepTask?: string,
): string {
  const reports = upstream.filter((entry) => entry.output.trim() !== "");
  if (reports.length === 0 && stepTask === undefined) {
    return task;
  }

  const taskBlock = `${TASK_HEADING}\n\n${task}`;
  const blocks =
    stepTask === undefined
      ? [taskBlock]
      : [`${ASSIGNMENT_HEADING}\n\n${stepTask.trim()}`, taskBlock];
  if (reports.length === 0) {
    return blocks.join("\n\n");
  }

  const handoffs = reports.map(
    (entry) => `### ${entry.label}\n\n${entry.output.trim()}`,
  );
  return [
    ...blocks,
    `${HANDOFF_HEADING}\n\n${HANDOFF_NOTE}`,
    ...handoffs,
  ].join("\n\n");
}

const VERDICT_LINE = new RegExp(
  `^[*\`_\\s]*VERDICT:\\s*(${Object.values(STAGE_VERDICTS).join("|")})[*\`_\\s]*$`,
  "i",
);

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

const QUESTION_LINE = /^[*`_\s]*QUESTION:\s*(.+?)[*`_\s]*$/i;

export function parseStageQuestion(output: string | undefined): string | undefined {
  if (!output) {
    return undefined;
  }
  const linesLastFirst = output.split("\n").reverse();
  for (const line of linesLastFirst) {
    const match = QUESTION_LINE.exec(line.replace(/\r$/, "").trim());
    const question = match?.[1]?.trim();
    if (question) {
      return question;
    }
  }
  return undefined;
}

export interface EngineStageOutcome {
  outcome: Exclude<StageOutcome, typeof STAGE_OUTCOMES.CANCELLED>;
  output?: string;
  verdict?: StageVerdict;
  question?: string;
  failureMessage?: string;
}

export interface InterpretOptions {
  profession: string;
  /** Only an interactive stage on a conversational engine may park on a question. */
  canAsk: boolean;
}

function engineStageOutcome(
  outcome: EngineStageOutcome["outcome"],
  output: string | undefined,
  verdict: StageVerdict | undefined,
  question: string | undefined,
  failureMessage: string | undefined,
): EngineStageOutcome {
  const result: EngineStageOutcome = { outcome };
  if (output !== undefined) result.output = output;
  if (verdict !== undefined) result.verdict = verdict;
  if (question !== undefined) result.question = question;
  if (failureMessage !== undefined) result.failureMessage = failureMessage;
  return result;
}

export function interpretEngineResult(
  result: EngineRunResult,
  { profession, canAsk }: InterpretOptions,
): EngineStageOutcome {
  if (!result.success) {
    return engineStageOutcome(
      STAGE_OUTCOMES.FAILED,
      undefined,
      undefined,
      undefined,
      result.errorMessage ?? `${profession} failed`,
    );
  }
  const output =
    result.result !== undefined && result.result.trim() !== "" ? result.result : undefined;

  const question = canAsk ? parseStageQuestion(result.result) : undefined;
  if (question !== undefined) {
    return engineStageOutcome(
      STAGE_OUTCOMES.ASKING,
      output,
      undefined,
      question,
      undefined,
    );
  }

  const verdict = parseStageVerdict(result.result);
  if (verdict === STAGE_VERDICTS.FAIL) {
    return engineStageOutcome(
      STAGE_OUTCOMES.NEEDS_ATTENTION,
      output,
      verdict,
      undefined,
      `${profession} reported VERDICT: FAIL`,
    );
  }
  if (verdict === STAGE_VERDICTS.SKIP) {
    return engineStageOutcome(
      STAGE_OUTCOMES.SKIPPED,
      output,
      verdict,
      undefined,
      undefined,
    );
  }
  return engineStageOutcome(
    STAGE_OUTCOMES.PASSED,
    output,
    verdict,
    undefined,
    undefined,
  );
}

export interface HandoffMeta {
  stageLabel: string;
  profession: string;
  engine: string;
  model?: string;
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

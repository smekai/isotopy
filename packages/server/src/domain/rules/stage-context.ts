import { STAGE_OUTCOMES, STAGE_OUTPUT_PROTOCOLS, STAGE_VERDICTS } from "@isotopy/core";
import type {
  EngineLimit,
  OrchestratorDecision,
  StageOutcome,
  StageOutputProtocol,
  StageVerdict,
} from "@isotopy/core";
import type { EngineRunResult } from "../../engines/types.ts";
import { extractOrchestratorDecision } from "../../schemas/orchestrator-decision.ts";
import { takeStageWait } from "../../schemas/stage-wait.ts";
import { formatValidationIssues } from "../validation.ts";
import { STAGE_WAIT_FENCE } from "./stage-wait.ts";
import type { StageWait } from "./stage-wait.ts";

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
  limit?: EngineLimit;
  wait?: StageWait;
}

export interface StageOutputRejection {
  reason: string;
}

export interface InterpretOptions {
  profession: string;
  canAsk: boolean;
  protocol?: StageOutputProtocol;
  waitMinIntervalMs?: number;
}

function userQuestionIn(decision: OrchestratorDecision): string | undefined {
  return decision.action === "ask_user" || decision.action === "escalate_to_user"
    ? decision.question
    : undefined;
}

function interpretDecision(
  output: string | undefined,
  { profession, canAsk }: InterpretOptions,
): EngineStageOutcome {
  const parsed = extractOrchestratorDecision(output ?? "");
  if (!parsed.ok) {
    return {
      outcome: STAGE_OUTCOMES.NEEDS_ATTENTION,
      output,
      failureMessage: `${profession} produced no usable decision — ${formatValidationIssues(parsed.issues)}`,
    };
  }
  const question = userQuestionIn(parsed.value);
  if (question !== undefined && canAsk) {
    return { outcome: STAGE_OUTCOMES.ASKING, output, question };
  }
  return { outcome: STAGE_OUTCOMES.PASSED, output };
}

export function interpretEngineResult(
  result: EngineRunResult,
  options: InterpretOptions,
): EngineStageOutcome {
  const { profession, canAsk, protocol } = options;
  if (result.limit) {
    return { outcome: STAGE_OUTCOMES.LIMITED, limit: result.limit };
  }
  if (!result.success) {
    return {
      outcome: STAGE_OUTCOMES.FAILED,
      failureMessage: result.errorMessage ?? `${profession} failed`,
    };
  }
  const output =
    result.result !== undefined && result.result.trim() !== "" ? result.result : undefined;

  if (protocol === STAGE_OUTPUT_PROTOCOLS.DECISION) {
    return interpretDecision(output, options);
  }

  const question = canAsk ? parseStageQuestion(result.result) : undefined;
  if (question !== undefined) {
    return {
      outcome: STAGE_OUTCOMES.ASKING,
      output,
      question,
    };
  }

  const waiting =
    output === undefined || options.waitMinIntervalMs === undefined
      ? undefined
      : interpretWait(output, profession, options.waitMinIntervalMs);
  if (waiting !== undefined) {
    return waiting;
  }

  const verdict = parseStageVerdict(result.result);
  if (verdict === STAGE_VERDICTS.FAIL) {
    return {
      outcome: STAGE_OUTCOMES.NEEDS_ATTENTION,
      output,
      verdict,
      failureMessage: `${profession} reported VERDICT: FAIL`,
    };
  }
  if (verdict === STAGE_VERDICTS.SKIP) {
    return {
      outcome: STAGE_OUTCOMES.SKIPPED,
      output,
      verdict,
    };
  }
  return {
    outcome: STAGE_OUTCOMES.PASSED,
    output,
    verdict,
  };
}

function interpretWait(
  output: string,
  profession: string,
  minIntervalMs: number,
): EngineStageOutcome | undefined {
  const taken = takeStageWait(output, minIntervalMs);
  if (taken === undefined) {
    return undefined;
  }
  if (!taken.wait.ok) {
    return {
      outcome: STAGE_OUTCOMES.NEEDS_ATTENTION,
      output: taken.report,
      failureMessage: `${profession} asked to wait with an unusable ${STAGE_WAIT_FENCE} block — ${formatValidationIssues(taken.wait.issues)}`,
    };
  }
  return { outcome: STAGE_OUTCOMES.WAITING, output: taken.report, wait: taken.wait.value };
}

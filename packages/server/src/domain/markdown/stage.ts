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
  environment?: string,
): string {
  const body = stagePromptBody(task, upstream, stepTask, environment);
  return stepTask ? markdownBlocks([body, STAGE_NOTES_INVITATION]) : body;
}

function stagePromptBody(
  task: string,
  upstream: UpstreamOutput[],
  stepTask?: string,
  environment?: string,
): string {
  const reports = upstream.filter((entry) => markdownBody(entry.output) !== "");
  const assignment = stepTask ? markdownBody(stepTask) : "";
  const surroundings = environment ? markdownBody(environment) : "";
  if (reports.length === 0 && assignment === "" && surroundings === "") {
    return markdownBody(task);
  }
  return markdownBlocks([
    assignment ? `## Step task\n\n${assignment}` : undefined,
    `## Task\n\n${markdownBody(task)}`,
    surroundings ? `## Environment\n\n${surroundings}` : undefined,
    reports.length > 0
      ? `## Handoff from previous steps\n\n${HANDOFF_NOTE}`
      : undefined,
    ...reports.map(
      (entry) =>
        `### ${structuralText(entry.label)}\n\n${markdownBody(entry.output)}`,
    ),
  ]);
}

export const STAGE_NOTES_INVITATION = [
  "## Notes for your next run here (optional)",
  "",
  "Learned something about **this project** you would want to know before starting",
  "here again? End your handoff with a fenced block — one line per note:",
  "",
  "```isotopy-persona-notes",
  '{ "notes": ["Migrations live in db/migrate, not prisma/"] }',
  "```",
  "",
  "Replayed to you alone, never to the other roles. Facts about the project, not a",
  "summary of this run — your handoff already carries that. Omit it when there is",
  "nothing durable to add.",
].join("\n");

const CONTINUATION_NOTE =
  "You already worked on this stage and stopped to ask. Your CLI cannot resume its " +
  "own session, so the exchange is replayed below. Continue from it — do not start " +
  "the stage over.";

export interface StageExchange {
  output?: string;
  question: string;
  answer: string;
}

export interface ContinuationPromptInput {
  task: string;
  upstream: UpstreamOutput[];
  exchanges: StageExchange[];
  stepTask?: string;
  environment?: string;
}

function exchangeBlocks(exchange: StageExchange, index: number): Array<string | undefined> {
  const turn = index + 1;
  return [
    exchange.output === undefined
      ? undefined
      : `### Your turn ${turn} response\n\n${markdownBody(exchange.output)}`,
    `### What you asked on turn ${turn}\n\n${markdownBody(exchange.question)}`,
    `### The answer you were given\n\n${markdownBody(exchange.answer)}`,
  ];
}

export function buildContinuationPrompt({
  task,
  upstream,
  exchanges,
  stepTask,
  environment,
}: ContinuationPromptInput): string {
  return markdownBlocks([
    stagePromptBody(task, upstream, stepTask, environment),
    `## Conversation so far\n\n${CONTINUATION_NOTE}`,
    ...exchanges.flatMap(exchangeBlocks),
    stepTask ? STAGE_NOTES_INVITATION : undefined,
  ]);
}

const MS_PER_MINUTE = 60_000;

export function buildTimeBudget(timeoutMs: number): string {
  const minutes = Math.round(timeoutMs / MS_PER_MINUTE);
  return [
    `You have about ${minutes} minutes. A step that runs past it is stopped where it stands and`,
    "reports no verdict at all, so the work is lost rather than partially credited.",
    "",
    "Budget for that. Reaching a verdict with the tools already here beats reaching for better",
    "ones and running out — if setup is eating the clock, abandon the setup, not the verdict.",
  ].join("\n");
}

export function buildResumePrompt(stepTask: string | undefined): string {
  return markdownBlocks([
    "# Continue where you were cut off",
    "",
    "Your previous attempt at this stage was stopped by a time limit before it reported a " +
      "verdict. This is the same session, so what you had already established is still above — " +
      "do not repeat it, and do not start the stage over.",
    "",
    "Take stock of what you had finished, finish only what is left, and end with your verdict. " +
      "If you were part-way through setting something up and it is not essential to reaching a " +
      "verdict, drop it and reach the verdict instead.",
    stepTask ? STAGE_NOTES_INVITATION : undefined,
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

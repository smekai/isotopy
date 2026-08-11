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
    buildStagePrompt(task, upstream, stepTask, environment),
    `## Conversation so far\n\n${CONTINUATION_NOTE}`,
    ...exchanges.flatMap(exchangeBlocks),
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

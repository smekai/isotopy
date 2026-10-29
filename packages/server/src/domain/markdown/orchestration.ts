import type {
  OrchestratorBrokerPhase,
  ProjectTeam,
  CloseoutReport,
  RunBranch,
} from "@isotopy/core";
import type { CatalogEntry } from "../rules/agent-catalog.ts";
import { ORCHESTRATOR_CONTEXT_LIMITS } from "../rules/orchestrator-context.ts";
import type { PersonaNoteSet } from "../rules/persona-notes.ts";
import { renderCloseoutBody } from "./closeout.ts";
import { bullet, markdownBlocks, markdownBody, structuralText } from "./format.ts";

export interface OrchestrationContext {
  goal: string;
  team: ProjectTeam;
  personas: CatalogEntry[];
  stepTasks: CatalogEntry[];
  tasksContext: string;
  closeoutContext: string;
  gatePreference?: string;
  personaConstraints?: string;
  orchestratorContext?: string;
}

export interface OrchestrationFollowUpContext extends OrchestrationContext {
  question: string;
  answer: string;
  artifacts: QuestionMediationArtifact[];
}

export interface QuestionMediationArtifact {
  runLabel: string;
  stageLabel: string;
  output: string;
}

export interface QuestionMediationMarkdownContext {
  goal: string;
  team: ProjectTeam;
  phase: OrchestratorBrokerPhase;
  originStageId: string;
  question: string;
  userAnswer?: string;
  artifacts: QuestionMediationArtifact[];
}

function renderCatalog(heading: string, entries: CatalogEntry[]): string {
  return markdownBlocks([
    `## ${heading}`,
    entries.map((entry) => bullet(`\`${entry.id}\` — ${entry.summary}`)).join("\n"),
  ]);
}

export function renderOrchestrationContext({
  goal,
  team,
  personas,
  stepTasks,
  tasksContext,
  closeoutContext,
  gatePreference,
  personaConstraints,
  orchestratorContext,
}: OrchestrationContext): string {
  return markdownBlocks([
    `## Orchestration goal\n\n${markdownBody(goal)}`,
    orchestratorContext === undefined ? undefined : renderOwnContext(orchestratorContext),
    renderProjectTeam(team),
    renderCatalog("Persona catalog", personas),
    renderCatalog("Step task catalog", stepTasks),
    gatePreference === undefined
      ? undefined
      : `## Where this project likes its gates\n\n${markdownBody(gatePreference)}`,
    personaConstraints === undefined
      ? undefined
      : `## What each role already knows about this project\n\n${markdownBody(personaConstraints)}`,
    markdownBody(tasksContext),
    markdownBody(closeoutContext),
  ]);
}

function renderOwnContext(orchestratorContext: string): string {
  return markdownBlocks([
    "## What you understood in earlier episodes",
    "Your own context, kept across episodes and rewritten by you when you review a settled run. Weigh it as yours, and trust the board and the run outputs below where they are newer.",
    markdownBody(orchestratorContext),
  ]);
}

export function renderPersonaConstraints(
  roles: PersonaNoteSet[],
): string | undefined {
  if (roles.length === 0) {
    return undefined;
  }
  return markdownBlocks([
    "Each role keeps its own notes about this project, written by that role at the end of an",
    "earlier run and replayed only to itself. They are what the team has already learned here, so",
    "compose around them rather than sending someone to rediscover them.",
    ...roles.map(({ skillId, notes }) =>
      markdownBlocks([
        `### \`${skillId}\``,
        notes.map((note) => bullet(note)).join("\n"),
      ]),
    ),
  ]);
}

export function renderGatePreference(gates: Record<string, boolean>): string | undefined {
  const stagesWhere = (enabled: boolean): string[] =>
    Object.entries(gates)
      .filter(([, on]) => on === enabled)
      .map(([key]) => `\`${key}\``);
  const wanted = stagesWhere(true);
  const waived = stagesWhere(false);
  if (wanted.length === 0 && waived.length === 0) {
    return undefined;
  }
  return markdownBlocks([
    "This project has asked for approval after some steps and not others. Each entry is",
    "`pipeline:stage`; a flow of the team runs as the pipeline `flow-<name>`. Isotopy applies",
    "these gates itself, so a run you start stops where the owner asked it to.",
    wanted.length === 0 ? undefined : `Approval wanted after: ${wanted.join(", ")}.`,
    waived.length === 0 ? undefined : `Approval waived after: ${waived.join(", ")}.`,
  ]);
}

export function renderOrchestrationFollowUp({
  question,
  answer,
  artifacts,
  ...context
}: OrchestrationFollowUpContext): string {
  return markdownBlocks([
    renderOrchestrationContext(context),
    renderArtifactSections("Prior run artifacts", artifacts),
    `## The question you asked\n\n${markdownBody(question)}`,
    `## The user's answer\n\n${markdownBody(answer)}`,
    "Decide what happens now, in the same one fenced block. The answer above is the one you asked for — do not ask it again.",
  ]);
}

export interface RejectedDecisionContext {
  task: string;
  error: string;
}

export function renderTaskAfterRejection({
  task,
  error,
}: RejectedDecisionContext): string {
  return markdownBlocks([task, renderRejectedDecision(error)]);
}

export interface ReviewRepairContext {
  errors: string[];
  replay?: { prompt: string; answer: string };
}

export function renderReviewRepair({ errors, replay }: ReviewRepairContext): string {
  return markdownBlocks([
    replay?.prompt,
    replay === undefined ? undefined : `## Your review\n\n${markdownBody(replay.answer)}`,
    "## Your review could not be acted on",
    errors.map((error) => bullet(markdownBody(error))).join("\n"),
    "Everything else in your review stands. Reply with only the fenced block or blocks named above, corrected — no prose, no other block. Nothing runs and the initiative waits on its owner if this reply cannot be read either.",
  ]);
}

function renderRejectedDecision(error: string): string {
  return markdownBlocks([
    "## Your last decision was rejected",
    markdownBody(error),
    "Decide again, correcting exactly what the rejection names. A decision carrying an unknown field, an invented enum value, or no fenced block at all is rejected whole, and nothing runs until one parses.",
  ]);
}

export function renderProjectTeam(team: ProjectTeam): string {
  const standing =
    team.state === "valid"
      ? "Every team run is one of these flows, named by `flow`. It starts without asking the owner."
      : `team.md is not valid, so no team run can start until it is fixed or replaced: ${team.issues.join("; ")}`;
  return markdownBlocks([
    "## The project's team — `.isotopy/team.md`",
    standing,
    `\`\`\`\`markdown\n${team.text.trimEnd()}\n\`\`\`\``,
  ]);
}

function renderArtifactSections(
  heading: string,
  artifacts: QuestionMediationArtifact[],
): string {
  if (artifacts.length === 0) {
    return `## ${heading}\n\nNone.`;
  }
  return markdownBlocks([
    `## ${heading}`,
    ...artifacts.map(
      ({ runLabel, stageLabel, output }) =>
        `### ${runLabel} · ${stageLabel}\n\n${markdownBody(output)}`,
    ),
  ]);
}

export interface RunReviewMilestoneContext {
  name: string;
  autoRunNext: boolean;
  readyFeatures: RunReviewFeature[];
}

export interface RunReviewFeature {
  id: string;
  title: string;
}

export interface RunReviewMarkdownContext {
  goal: string;
  team: ProjectTeam;
  runLabel: string;
  runStatus: string;
  closeout?: CloseoutReport;
  artifacts: QuestionMediationArtifact[];
  milestone?: RunReviewMilestoneContext;
  rejectedDecision?: string;
  orchestratorContext?: string;
  branch?: RunBranch;
}

function renderInitiativeBranch(branch: RunBranch | undefined): string {
  if (branch === undefined) {
    return "## Branch\n\nThis initiative works without a branch of its own, so there is nothing to merge.";
  }
  const name = structuralText(branch.name);
  const base = structuralText(branch.base);
  return [
    "## Branch",
    "",
    `This initiative's work is committed on \`${name}\`, cut from \`${base}\`. Stopping with`,
    `\`"merge": true\` merges it into \`${base}\`; stopping without it leaves the branch unmerged`,
    "for the owner.",
  ].join("\n");
}

function renderReviewMilestone(milestone: RunReviewMilestoneContext): string {
  const features =
    milestone.readyFeatures.length > 0
      ? milestone.readyFeatures
          .map((feature) =>
            bullet(`\`${feature.id}\` — ${structuralText(feature.title)}`),
          )
          .join("\n")
      : "No feature is ready to run.";
  const permission = milestone.autoRunNext
    ? "`continue_milestone` is permitted."
    : "`continue_milestone` is not permitted — this milestone does not continue on its own.";
  return markdownBlocks([
    `## Milestone: ${structuralText(milestone.name)}`,
    permission,
    "### Ready features",
    features,
  ]);
}

export function renderRunReviewContext({
  goal,
  team,
  runLabel,
  runStatus,
  closeout,
  artifacts,
  milestone,
  rejectedDecision,
  orchestratorContext,
  branch,
}: RunReviewMarkdownContext): string {
  return markdownBlocks([
    `## Orchestration goal\n\n${markdownBody(goal)}`,
    renderProjectTeam(team),
    `## Settled run\n\n${structuralText(runLabel)} finished as \`${runStatus}\`.`,
    renderInitiativeBranch(branch),
    closeout
      ? `## Run closeout\n\n${renderCloseoutBody(closeout, "###")}`
      : undefined,
    milestone ? renderReviewMilestone(milestone) : undefined,
    renderArtifactSections("Stage outputs", artifacts),
    renderContextForRevision(orchestratorContext),
    rejectedDecision === undefined
      ? undefined
      : renderRejectedDecision(rejectedDecision),
  ]);
}

function renderContextForRevision(orchestratorContext: string | undefined): string {
  const { lines, bytes } = ORCHESTRATOR_CONTEXT_LIMITS;
  return markdownBlocks([
    "## Your context so far",
    orchestratorContext === undefined ? "You have kept no context yet." : markdownBody(orchestratorContext),
    `Cap: at most ${lines} lines and ${bytes} bytes.`,
  ]);
}

export function renderQuestionMediationContext({
  goal,
  team,
  phase,
  originStageId,
  question,
  userAnswer,
  artifacts,
}: QuestionMediationMarkdownContext): string {
  const assignment =
    phase === "question"
      ? "Answer the specialist with `answer_agent`, or rewrite and escalate with `escalate_to_user`."
      : `Route the user's reply back to \`${originStageId}\` with \`route_to_agent\`.`;
  return markdownBlocks([
    `## Orchestration goal\n\n${markdownBody(goal)}`,
    renderProjectTeam(team),
    `## Specialist question\n\nOrigin: \`${originStageId}\`\n\n${markdownBody(question)}`,
    userAnswer === undefined
      ? undefined
      : `## User answer\n\n${markdownBody(userAnswer)}`,
    renderArtifactSections("Prior run artifacts", artifacts),
    `## Current assignment\n\n${assignment}`,
  ]);
}

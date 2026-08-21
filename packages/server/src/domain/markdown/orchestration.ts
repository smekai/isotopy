import type {
  OrchestratorBrokerPhase,
  OrchestratorTeamProposal,
  CloseoutReport,
} from "@isotopy/core";
import type { CatalogEntry } from "../skills/catalog.ts";
import type { PersonaNoteSet } from "../rules/persona-notes.ts";
import { renderCloseoutBody } from "./closeout.ts";
import { bullet, markdownBlocks, markdownBody, structuralText } from "./format.ts";

export interface OrchestrationContext {
  goal: string;
  personas: CatalogEntry[];
  stepTasks: CatalogEntry[];
  boardContext: string;
  closeoutContext: string;
  gatePreference?: string;
  personaConstraints?: string;
}

export interface OrchestrationFollowUpContext extends OrchestrationContext {
  team?: OrchestratorTeamProposal;
  question: string;
  answer: string;
  artifacts: QuestionMediationArtifact[];
}

export interface ComposedRunContext {
  goal: string;
  team: OrchestratorTeamProposal;
}

export interface QuestionMediationArtifact {
  runLabel: string;
  stageLabel: string;
  output: string;
}

export interface QuestionMediationMarkdownContext {
  goal: string;
  team?: OrchestratorTeamProposal;
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
  personas,
  stepTasks,
  boardContext,
  closeoutContext,
  gatePreference,
  personaConstraints,
}: OrchestrationContext): string {
  return markdownBlocks([
    `## Orchestration goal\n\n${markdownBody(goal)}`,
    renderCatalog("Persona catalog", personas),
    renderCatalog("Step task catalog", stepTasks),
    gatePreference === undefined
      ? undefined
      : `## Where this project likes its gates\n\n${markdownBody(gatePreference)}`,
    personaConstraints === undefined
      ? undefined
      : `## What each role already knows about this project\n\n${markdownBody(personaConstraints)}`,
    markdownBody(boardContext),
    markdownBody(closeoutContext),
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
    "On its fixed pipelines this project has asked for approval after some steps and not others.",
    "Each entry is `pipeline:stage`, because the same stage name can be gated in one pipeline and",
    "not another. Treat it as a preference and not a rule: you own `gateAfter` for the team you",
    "compose, and a role whose work the user has said they want to see is a good candidate for one.",
    wanted.length === 0 ? undefined : `Approval wanted after: ${wanted.join(", ")}.`,
    waived.length === 0 ? undefined : `Approval waived after: ${waived.join(", ")}.`,
  ]);
}

export function renderOrchestrationFollowUp({
  team,
  question,
  answer,
  artifacts,
  ...context
}: OrchestrationFollowUpContext): string {
  return markdownBlocks([
    renderOrchestrationContext(context),
    team === undefined
      ? undefined
      : `## Approved team: ${team.name}\n\n${markdownBody(team.summary)}\n\n${renderRoles(team)}`,
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

function renderRejectedDecision(error: string): string {
  return markdownBlocks([
    "## Your last decision was rejected",
    markdownBody(error),
    "Decide again, correcting exactly what the rejection names. A decision carrying an unknown field, an invented enum value, or no fenced block at all is rejected whole, and nothing runs until one parses.",
  ]);
}

function renderRoles(team: OrchestratorTeamProposal): string {
  return team.roles
    .map((role) =>
      bullet(
        `**${role.label}** (\`${role.id}\`) — ${role.rationale ?? role.stepTask}`,
      ),
    )
    .join("\n");
}

export function renderComposedRunTask({ goal, team }: ComposedRunContext): string {
  return markdownBlocks([
    `## Goal\n\n${markdownBody(goal)}`,
    `## Approved team: ${team.name}\n\n${markdownBody(team.summary)}`,
    renderRoles(team),
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
  team?: OrchestratorTeamProposal;
  runLabel: string;
  runStatus: string;
  closeout?: CloseoutReport;
  artifacts: QuestionMediationArtifact[];
  milestone?: RunReviewMilestoneContext;
  rejectedDecision?: string;
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
}: RunReviewMarkdownContext): string {
  return markdownBlocks([
    `## Orchestration goal\n\n${markdownBody(goal)}`,
    team
      ? `## Team currently composed: ${team.name}\n\n${markdownBody(team.summary)}\n\n${renderRoles(team)}\n\nThis is the team that just ran. Keep it, or propose a different one if the work ahead needs another shape.`
      : "## Team currently composed\n\nNo team has been approved yet.",
    `## Settled run\n\n${structuralText(runLabel)} finished as \`${runStatus}\`.`,
    closeout
      ? `## Run closeout\n\n${renderCloseoutBody(closeout, "###")}`
      : undefined,
    milestone ? renderReviewMilestone(milestone) : undefined,
    renderArtifactSections("Stage outputs", artifacts),
    rejectedDecision === undefined
      ? undefined
      : renderRejectedDecision(rejectedDecision),
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
    team
      ? `## Approved team: ${team.name}\n\n${markdownBody(team.summary)}\n\n${renderRoles(team)}`
      : "## Approved team\n\nNo team has been approved yet.",
    `## Specialist question\n\nOrigin: \`${originStageId}\`\n\n${markdownBody(question)}`,
    userAnswer === undefined
      ? undefined
      : `## User answer\n\n${markdownBody(userAnswer)}`,
    renderArtifactSections("Prior run artifacts", artifacts),
    `## Current assignment\n\n${assignment}`,
  ]);
}

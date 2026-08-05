import type {
  OrchestratorBrokerPhase,
  OrchestratorTeamProposal,
  ProductManagerCloseout,
} from "@adhd/core";
import type { CatalogEntry } from "../skills/catalog.ts";
import { renderCloseoutBody } from "./closeout.ts";
import { bullet, markdownBlocks, markdownBody, structuralText } from "./format.ts";

export interface OrchestrationContext {
  goal: string;
  personas: CatalogEntry[];
  stepTasks: CatalogEntry[];
  boardContext: string;
  closeoutContext: string;
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
}: OrchestrationContext): string {
  return markdownBlocks([
    `## Orchestration goal\n\n${markdownBody(goal)}`,
    renderCatalog("Persona catalog", personas),
    renderCatalog("Step task catalog", stepTasks),
    markdownBody(boardContext),
    markdownBody(closeoutContext),
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
  closeout?: ProductManagerCloseout;
  artifacts: QuestionMediationArtifact[];
  milestone?: RunReviewMilestoneContext;
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
}: RunReviewMarkdownContext): string {
  return markdownBlocks([
    `## Orchestration goal\n\n${markdownBody(goal)}`,
    team
      ? `## Approved team: ${team.name}\n\n${markdownBody(team.summary)}\n\n${renderRoles(team)}`
      : "## Approved team\n\nNo team has been approved yet.",
    `## Settled run\n\n${structuralText(runLabel)} finished as \`${runStatus}\`.`,
    closeout
      ? `## Product Manager closeout\n\n${renderCloseoutBody(closeout, "###")}`
      : undefined,
    milestone ? renderReviewMilestone(milestone) : undefined,
    renderArtifactSections("Stage outputs", artifacts),
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

import type {
  OrchestratorBrokerPhase,
  OrchestratorTeamProposal,
} from "@adhd/core";
import type { CatalogEntry } from "../skills/catalog.ts";
import { bullet, markdownBlocks, markdownBody } from "./format.ts";

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

function renderMediationArtifacts(artifacts: QuestionMediationArtifact[]): string {
  if (artifacts.length === 0) {
    return "## Prior run artifacts\n\nNone.";
  }
  return markdownBlocks([
    "## Prior run artifacts",
    ...artifacts.map(
      ({ runLabel, stageLabel, output }) =>
        `### ${runLabel} · ${stageLabel}\n\n${markdownBody(output)}`,
    ),
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
    renderMediationArtifacts(artifacts),
    `## Current assignment\n\n${assignment}`,
  ]);
}

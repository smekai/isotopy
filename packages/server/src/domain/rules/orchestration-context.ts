import { ORCHESTRATION_PIPELINE } from "@isotopy/core";
import type { Milestone, Orchestration, RunState } from "@isotopy/core";
import { renderCloseoutBody } from "../markdown/closeout.ts";
import type {
  QuestionMediationArtifact,
  RunReviewMilestoneContext,
} from "../markdown/orchestration.ts";

export function runLabel(run: RunState): string {
  return `Run ${run.number}: ${run.pipelineName}`;
}

export function stageOutputsOf(run: RunState): QuestionMediationArtifact[] {
  return run.stages.flatMap((stage) => {
    const output = run.stageOutputs?.[stage.id];
    return output
      ? [{ runLabel: runLabel(run), stageLabel: stage.label, output }]
      : [];
  });
}

export function artifactDigestOf(run: RunState): QuestionMediationArtifact[] {
  const report = run.closeout?.report;
  return report
    ? [
        {
          runLabel: runLabel(run),
          stageLabel: "Run closeout",
          output: renderCloseoutBody(report, "####"),
        },
      ]
    : stageOutputsOf(run);
}

export function digestsOf(runs: RunState[]): QuestionMediationArtifact[] {
  return [...runs]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .flatMap(artifactDigestOf);
}

function teamRunsOf(runIds: Iterable<string>, runs: RunState[]): RunState[] {
  const owned = new Set(runIds);
  return runs.filter((run) => owned.has(run.id) && run.pipelineId !== ORCHESTRATION_PIPELINE.id);
}

export function priorArtifactsOf(
  orchestration: Orchestration,
  runs: RunState[],
): QuestionMediationArtifact[] {
  return digestsOf(teamRunsOf(orchestration.runIds, runs));
}

export function mediationArtifactsOf(
  orchestration: Orchestration,
  current: RunState,
  runs: RunState[],
): QuestionMediationArtifact[] {
  return teamRunsOf([...orchestration.runIds, current.id], runs)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .flatMap((run) => (run.id === current.id ? stageOutputsOf(run) : artifactDigestOf(run)));
}

export function milestoneReviewContext(
  milestone: Milestone,
  settlingFeatureId?: string,
): RunReviewMilestoneContext {
  return {
    name: milestone.name,
    autoRunNext: milestone.autoRunNext,
    readyFeatures: milestone.features
      .filter(
        (feature) => feature.status === "ready" && feature.id !== settlingFeatureId,
      )
      .map((feature) => ({ id: feature.id, title: feature.title })),
  };
}

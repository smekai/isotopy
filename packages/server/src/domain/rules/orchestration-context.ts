import type { Milestone, RunState } from "@isotopy/core";
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

const MILESTONE_PLANNING_PIPELINE_ID = "milestone-planning";

export function resolveOwningOrchestration(
  requested: string | undefined,
  active: string | undefined,
): string | undefined {
  if (requested !== undefined && active !== undefined && requested !== active) {
    throw new Error(
      "The requested Orchestrator is not the project's active Orchestrator",
    );
  }
  return requested ?? active;
}

export function isPlanningRun(
  pipelineId: string,
  milestoneId: string | undefined,
  featureId: string | undefined,
): boolean {
  const planningRun =
    pipelineId === MILESTONE_PLANNING_PIPELINE_ID &&
    milestoneId !== undefined &&
    featureId === undefined;
  if (!planningRun && (milestoneId === undefined) !== (featureId === undefined)) {
    throw new Error("milestoneId and featureId must be provided together");
  }
  return planningRun;
}

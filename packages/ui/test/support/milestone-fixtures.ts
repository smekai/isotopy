import { HOME_PROJECT_ID } from "@adhd/core";
import type {
  Milestone,
  MilestoneFeature,
  MilestoneFeatureStatus,
  MilestoneFinding,
  RunStatus,
  RunSummary,
} from "@adhd/core";

const AT = "2026-07-31T00:00:00.000Z";

export const MILESTONE_ID = "m1";

export function finding(
  id: string,
  title: string,
  severity: MilestoneFinding["severity"],
  evidence?: string,
): MilestoneFinding {
  return { id, title, severity, sourceRunId: "r1", evidence };
}

export function feature(
  id: string,
  status: MilestoneFeatureStatus,
  overrides: Partial<MilestoneFeature> = {},
): MilestoneFeature {
  return {
    id,
    title: `Feature ${id}`,
    acceptanceCriteria: [],
    status,
    taskIds: [],
    runIds: [],
    findings: [],
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  };
}

export function milestone(
  features: MilestoneFeature[],
  overrides: Partial<Milestone> = {},
): Milestone {
  return {
    id: MILESTONE_ID,
    projectId: HOME_PROJECT_ID,
    name: "Milestone D",
    goal: "Ship the Full Delivery loop",
    status: "active",
    autoRunNext: false,
    features,
    planningRunIds: [],
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  };
}

export function featureRun(
  id: string,
  number: number,
  status: RunStatus,
  featureId: string,
): RunSummary {
  return {
    id,
    number,
    projectId: HOME_PROJECT_ID,
    milestoneId: MILESTONE_ID,
    featureId,
    pipelineId: "full-delivery",
    pipelineName: "Full Delivery",
    status,
    createdAt: AT,
    stages: [],
  };
}

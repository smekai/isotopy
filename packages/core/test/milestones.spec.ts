import { describe, expect, test } from "vitest";
import {
  canFinalizeMilestone,
  canStartNextFeature,
  milestoneFindings,
  milestoneProgress,
} from "../src/milestones.ts";
import type {
  Milestone,
  MilestoneFeature,
  MilestoneFeatureStatus,
  MilestoneFinding,
} from "../src/milestones.ts";

const NOW = "2026-07-31T00:00:00.000Z";

function feature(
  id: string,
  status: MilestoneFeatureStatus,
  findings: MilestoneFinding[] = [],
): MilestoneFeature {
  return {
    id,
    title: id,
    acceptanceCriteria: [],
    status,
    taskIds: [],
    runIds: [],
    findings,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function milestone(
  features: MilestoneFeature[],
  status: Milestone["status"] = "active",
): Milestone {
  return {
    id: "m1",
    projectId: "home",
    name: "Milestone D",
    status,
    autoRunNext: false,
    features,
    planningRunIds: [],
    createdAt: NOW,
    updatedAt: NOW,
  };
}

describe("milestoneProgress", () => {
  test("counts completed features against the total", () => {
    expect(
      milestoneProgress(
        milestone([feature("a", "completed"), feature("b", "ready")]),
      ),
    ).toEqual({ completed: 1, total: 2 });
  });
});

describe("canStartNextFeature", () => {
  test("allows a start when an active milestone has a ready feature", () => {
    expect(canStartNextFeature(milestone([feature("a", "ready")]))).toBe(true);
  });

  test("refuses while another feature is in progress", () => {
    expect(
      canStartNextFeature(
        milestone([feature("a", "in_progress"), feature("b", "ready")]),
      ),
    ).toBe(false);
  });

  test("refuses when no feature is ready", () => {
    expect(
      canStartNextFeature(
        milestone([feature("a", "completed"), feature("b", "needs_attention")]),
      ),
    ).toBe(false);
  });

  test("refuses on a draft milestone", () => {
    expect(canStartNextFeature(milestone([feature("a", "ready")], "draft"))).toBe(
      false,
    );
  });
});

describe("canFinalizeMilestone", () => {
  test("allows finalizing once every feature is completed", () => {
    expect(
      canFinalizeMilestone(
        milestone([feature("a", "completed"), feature("b", "completed")]),
      ),
    ).toBe(true);
  });

  test("refuses while a feature needs attention", () => {
    expect(
      canFinalizeMilestone(
        milestone([feature("a", "completed"), feature("b", "needs_attention")]),
      ),
    ).toBe(false);
  });

  test("refuses on an already completed milestone", () => {
    expect(
      canFinalizeMilestone(milestone([feature("a", "completed")], "completed")),
    ).toBe(false);
  });
});

describe("milestoneFindings", () => {
  test("flattens every feature's findings, blocking first", () => {
    const blocking: MilestoneFinding = {
      id: "f2",
      title: "Data loss on retry",
      severity: "blocking",
      sourceRunId: "r2",
    };
    const advisory: MilestoneFinding = {
      id: "f1",
      title: "Copy could be clearer",
      severity: "non_blocking",
      sourceRunId: "r1",
    };

    expect(
      milestoneFindings(
        milestone([
          feature("a", "completed", [advisory]),
          feature("b", "needs_attention", [blocking]),
        ]),
      ),
    ).toEqual([blocking, advisory]);
  });
});

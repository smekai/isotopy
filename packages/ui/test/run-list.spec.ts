// Unit spec: the rail is fed by a snapshot plus a live stream, so a summary can
// arrive for a run the snapshot already holds (replace, keep position) or for one
// it has never seen (prepend — the server sorts newest first).
import { describe, expect, test } from "vitest";
import { HOME_PROJECT_ID } from "@adhd/core";
import type { RunStatus, RunSummary } from "@adhd/core";
import {
  mergeSummaries,
  mergeSummary,
  milestoneRefreshKey,
  runsForFeature,
} from "../src/run-list";

function summary(id: string, status: RunStatus, number = 1): RunSummary {
  return {
    id,
    number,
    projectId: HOME_PROJECT_ID,
    pipelineId: "pm-dev-test",
    pipelineName: "Developer + Tester",
    status,
    createdAt: "2026-07-27T10:00:00.000Z",
    stages: [],
  };
}

function featureRun(
  id: string,
  status: RunStatus,
  featureId: string,
): RunSummary {
  return { ...summary(id, status), milestoneId: "m1", featureId };
}

describe("mergeSummary", () => {
  test("replaces a run in place, keeping its position", () => {
    const merged = mergeSummary(
      [summary("a", "running"), summary("b", "completed")],
      summary("a", "completed"),
    );
    expect(merged.map((run) => run.id)).toEqual(["a", "b"]);
    expect(merged[0]?.status).toBe("completed");
  });

  test("prepends a run it has not seen", () => {
    const merged = mergeSummary([summary("a", "completed")], summary("new", "running"));
    expect(merged.map((run) => run.id)).toEqual(["new", "a"]);
  });

  test("does not mutate the list it was given", () => {
    const runs = [summary("a", "running")];
    mergeSummary(runs, summary("a", "failed"));
    expect(runs[0]?.status).toBe("running");
  });
});

describe("mergeSummaries", () => {
  test("replays buffered summaries over a snapshot in order", () => {
    const merged = mergeSummaries(
      [summary("a", "running")],
      [summary("a", "awaiting"), summary("a", "completed")],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]?.status).toBe("completed");
  });

});

describe("runsForFeature", () => {
  test("keeps only the runs linked to that feature", () => {
    const runs = [
      featureRun("a", "completed", "f1"),
      featureRun("b", "running", "f2"),
      summary("c", "completed"),
    ];
    expect(runsForFeature(runs, "f1").map((run) => run.id)).toEqual(["a"]);
  });
});

describe("milestoneRefreshKey", () => {
  test("changes when a milestone run changes status", () => {
    const before = milestoneRefreshKey([featureRun("a", "running", "f1")]);
    const after = milestoneRefreshKey([featureRun("a", "completed", "f1")]);
    expect(after).not.toBe(before);
  });

  test("ignores runs that belong to no milestone", () => {
    const key = milestoneRefreshKey([featureRun("a", "running", "f1")]);
    expect(
      milestoneRefreshKey([featureRun("a", "running", "f1"), summary("c", "failed")]),
    ).toBe(key);
  });

  test("is stable under rail reordering, so a prepend alone does not refetch", () => {
    const a = featureRun("a", "completed", "f1");
    const b = featureRun("b", "running", "f2");
    expect(milestoneRefreshKey([a, b])).toBe(milestoneRefreshKey([b, a]));
  });
});

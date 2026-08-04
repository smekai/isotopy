// Unit spec: the rail is fed by a snapshot plus a live stream, so a summary can
// arrive for a run the snapshot already holds (replace, keep position) or for one
// it has never seen (prepend — the server sorts newest first).
import { describe, expect, test } from "vitest";
import {
  mergeSummaries,
  mergeSummary,
  milestoneRefreshKey,
  runsForFeature,
} from "../../src/run-list";
import { featureRun } from "../support/milestone-fixtures";
import { summary } from "../support/run-fixtures";

describe("mergeSummary", () => {
  test("replaces a run in place, keeping its position", () => {
    const merged = mergeSummary(
      [summary({ id: "a", status: "running" }), summary({ id: "b", status: "completed" })],
      summary({ id: "a", status: "completed" }),
    );
    expect(merged.map((run) => run.id)).toEqual(["a", "b"]);
    expect(merged[0]?.status).toBe("completed");
  });

  test("prepends a run it has not seen", () => {
    const merged = mergeSummary([summary({ id: "a", status: "completed" })], summary({ id: "new", status: "running" }));
    expect(merged.map((run) => run.id)).toEqual(["new", "a"]);
  });

  test("does not mutate the list it was given", () => {
    const runs = [summary({ id: "a", status: "running" })];
    mergeSummary(runs, summary({ id: "a", status: "failed" }));
    expect(runs[0]?.status).toBe("running");
  });
});

describe("mergeSummaries", () => {
  test("replays buffered summaries over a snapshot in order", () => {
    const merged = mergeSummaries(
      [summary({ id: "a", status: "running" })],
      [summary({ id: "a", status: "awaiting" }), summary({ id: "a", status: "completed" })],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]?.status).toBe("completed");
  });

});

describe("runsForFeature", () => {
  test("keeps only the runs linked to that feature", () => {
    const runs = [
      featureRun("a", 1, "completed", "f1"),
      featureRun("b", 1, "running", "f2"),
      summary({ id: "c", status: "completed" }),
    ];
    expect(runsForFeature(runs, "f1").map((run) => run.id)).toEqual(["a"]);
  });
});

describe("milestoneRefreshKey", () => {
  test("changes when a milestone run changes status", () => {
    const before = milestoneRefreshKey([featureRun("a", 1, "running", "f1")]);
    const after = milestoneRefreshKey([featureRun("a", 1, "completed", "f1")]);
    expect(after).not.toBe(before);
  });

  test("ignores runs that belong to no milestone", () => {
    const key = milestoneRefreshKey([featureRun("a", 1, "running", "f1")]);
    expect(
      milestoneRefreshKey([featureRun("a", 1, "running", "f1"), summary({ id: "c", status: "failed" })]),
    ).toBe(key);
  });

  test("is stable under rail reordering, so a prepend alone does not refetch", () => {
    const a = featureRun("a", 1, "completed", "f1");
    const b = featureRun("b", 1, "running", "f2");
    expect(milestoneRefreshKey([a, b])).toBe(milestoneRefreshKey([b, a]));
  });
});

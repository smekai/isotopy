// Unit spec: the rail is fed by a snapshot plus a live stream, so a summary can
// arrive for a run the snapshot already holds (replace, keep position) or for one
// it has never seen (prepend — the server sorts newest first).
import { describe, expect, test } from "vitest";
import {
  mergeSummaries,
  mergeSummary,
  milestoneRefreshKey,
  orchestrationRefreshKey,
  runsForFeature,
  runsForOrchestration,
} from "../../src/run-list";
import { featureRun } from "../support/milestone-fixtures";
import { orchestratedRun, orchestration } from "../support/orchestration-fixtures";
import { stage, summary } from "../support/run-fixtures";

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

describe("runsForOrchestration", () => {
  test("reads oldest first, because a timeline runs forward while the rail runs back", () => {
    const runs = [
      orchestratedRun("later", "2026-08-01T12:00:00.000Z"),
      orchestratedRun("earlier", "2026-08-01T09:00:00.000Z"),
    ];
    expect(
      runsForOrchestration(runs, orchestration({ runIds: ["earlier", "later"] })).map(
        (run) => run.id,
      ),
    ).toEqual(["earlier", "later"]);
  });

  test("keeps only the runs the orchestration claims, not every run it can see", () => {
    const runs = [
      orchestratedRun("mine", "2026-08-01T09:00:00.000Z"),
      orchestratedRun("someone-elses", "2026-08-01T10:00:00.000Z"),
    ];
    expect(
      runsForOrchestration(runs, orchestration({ runIds: ["mine"] })).map((run) => run.id),
    ).toEqual(["mine"]);
  });
});

describe("orchestrationRefreshKey", () => {
  test("changes when a stage settles, which is when a decision is recorded", () => {
    const before = orchestrationRefreshKey([
      orchestratedRun("a", "2026-08-01T09:00:00.000Z", { stages: [stage("orchestrate", "running")] }),
    ]);
    const after = orchestrationRefreshKey([
      orchestratedRun("a", "2026-08-01T09:00:00.000Z", { stages: [stage("orchestrate", "passed")] }),
    ]);
    expect(after).not.toBe(before);
  });

  test("ignores runs no orchestrator owns", () => {
    const key = orchestrationRefreshKey([orchestratedRun("a", "2026-08-01T09:00:00.000Z")]);
    expect(
      orchestrationRefreshKey([
        orchestratedRun("a", "2026-08-01T09:00:00.000Z"),
        summary({ id: "loose", status: "completed" }),
      ]),
    ).toBe(key);
  });

  test("is stable under rail reordering, so a prepend alone does not refetch", () => {
    const a = orchestratedRun("a", "2026-08-01T09:00:00.000Z");
    const b = orchestratedRun("b", "2026-08-01T10:00:00.000Z");
    expect(orchestrationRefreshKey([a, b])).toBe(orchestrationRefreshKey([b, a]));
  });
});

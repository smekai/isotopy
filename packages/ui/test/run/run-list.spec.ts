// Unit spec: the rail is fed by a snapshot plus a live stream, so a summary can
// arrive for a run the snapshot already holds (replace, keep position) or for one
// it has never seen (prepend — the server sorts newest first).
import { describe, expect, test } from "vitest";
import type { RailItem } from "../../src/run-list";
import {
  mergeSummaries,
  mergeSummary,
  milestoneRefreshKey,
  orchestrationRefreshKey,
  SCHEDULE_GROUP_RUNS,
  railItems,
  runsForFeature,
  runsForOrchestration,
} from "../../src/run-list";
import { featureRun } from "../support/milestone-fixtures";
import {
  ORCHESTRATION_ID,
  orchestratedRun,
  orchestration,
  scheduleView,
} from "../support/orchestration-fixtures";
import type { RunSummary } from "@isotopy/core";
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

describe("railItems", () => {
  test("gathers an initiative's runs under it, oldest first, because a timeline runs forward", () => {
    // Arrange
    const runs = [
      orchestratedRun("later", "2026-08-01T12:00:00.000Z"),
      orchestratedRun("earlier", "2026-08-01T09:00:00.000Z"),
    ];

    // Act
    const items = railItems(runs, [orchestration({ runIds: ["earlier", "later"] })]);

    // Assert
    expect(items).toHaveLength(1);
    expect(items[0]?.kind).toBe("initiative");
    expect(initiativeRuns(items[0]).map((run) => run.id)).toEqual(["earlier", "later"]);
  });

  test("leaves a run no orchestrator owns at the top level", () => {
    // Arrange
    const loose = summary({ id: "loose", createdAt: "2026-08-01T10:00:00.000Z" });

    // Act
    const items = railItems([loose], []);

    // Assert
    expect(items).toEqual([{ kind: "run", run: loose }]);
  });

  test("keeps a run visible when its orchestration has not loaded yet", () => {
    // Arrange — the run stream is live while orchestrations are refetched, so a run
    // can name an initiative this render has never seen. Losing it is worse than
    // showing it ungrouped for one frame.
    const orphan = orchestratedRun("orphan", "2026-08-01T10:00:00.000Z");

    // Act
    const items = railItems([orphan], []);

    // Assert
    expect(items).toEqual([{ kind: "run", run: orphan }]);
  });

  test("orders the rail newest first, ranking an initiative by its most recent run", () => {
    // Arrange
    const runs = [
      summary({ id: "loose", createdAt: "2026-08-01T11:00:00.000Z" }),
      orchestratedRun("first", "2026-08-01T09:00:00.000Z"),
      orchestratedRun("last", "2026-08-01T13:00:00.000Z"),
    ];

    // Act
    const items = railItems(runs, [orchestration({ runIds: ["first", "last"] })]);

    // Assert — the initiative outranks the loose run on its newest member, not its oldest.
    expect(items.map(railItemId)).toEqual([ORCHESTRATION_ID, "loose"]);
  });
});

describe("railItems, for recurring work", () => {
  test("every episode of one schedule is one group, however many Orchestrators served it", () => {
    // Arrange — two episodes, each with its own Orchestrator, as the design intends.
    const runs = [
      summary({ id: "monday", createdAt: "2026-08-01T09:00:00.000Z", orchestrationId: "o1" }),
      summary({ id: "tuesday", createdAt: "2026-08-02T09:00:00.000Z", orchestrationId: "o2" }),
    ];
    const episodes = [
      orchestration({ id: "o1", scheduleId: "s1", runIds: ["monday"] }),
      orchestration({ id: "o2", scheduleId: "s1", runIds: ["tuesday"] }),
    ];

    // Act
    const items = railItems(runs, episodes, [scheduleView({ id: "s1" })]);

    // Assert
    expect(items).toHaveLength(1);
    expect(scheduleRuns(items[0]).map((run) => run.id)).toEqual(["monday", "tuesday"]);
  });

  test("a long-running schedule shows its most recent fires, not every fire it ever had", () => {
    // Arrange — a schedule that has fired more times than a rail group may show.
    const runs = firesOf("s1", SCHEDULE_GROUP_RUNS + 3);

    // Act
    const items = railItems(runs.summaries, runs.episodes, [scheduleView({ id: "s1" })]);

    // Assert — the oldest fires are reachable from the detail view, not the rail.
    expect(scheduleRuns(items[0])).toHaveLength(SCHEDULE_GROUP_RUNS);
    expect(scheduleRuns(items[0]).at(-1)?.id).toBe("fire-7");
    expect(scheduleTotal(items[0])).toBe(SCHEDULE_GROUP_RUNS + 3);
  });

  test("manual work keeps its own initiative group, so a schedule never swallows it", () => {
    // Arrange
    const runs = [
      summary({ id: "scheduled", createdAt: "2026-08-01T09:00:00.000Z", orchestrationId: "o1" }),
      summary({ id: "manual", createdAt: "2026-08-01T10:00:00.000Z", orchestrationId: "o2" }),
    ];
    const episodes = [
      orchestration({ id: "o1", scheduleId: "s1", runIds: ["scheduled"] }),
      orchestration({ id: "o2", runIds: ["manual"] }),
    ];

    // Act
    const items = railItems(runs, episodes, [scheduleView({ id: "s1" })]);

    // Assert
    expect(items.map((item) => item.kind)).toEqual(["initiative", "schedule"]);
  });

  test("runs of a deleted schedule stay visible as ordinary initiatives rather than vanishing", () => {
    // Arrange — the schedule is gone; its history is not.
    const runs = [summary({ id: "orphaned", createdAt: "2026-08-01T09:00:00.000Z", orchestrationId: "o1" })];
    const episodes = [orchestration({ id: "o1", scheduleId: "deleted", runIds: ["orphaned"] })];

    // Act
    const items = railItems(runs, episodes, []);

    // Assert
    expect(items.map((item) => item.kind)).toEqual(["initiative"]);
  });
});

function firesOf(scheduleId: string, count: number) {
  const indexes = [...Array(count).keys()];
  return {
    summaries: indexes.map((index) =>
      summary({
        id: `fire-${index}`,
        createdAt: `2026-08-${String(index + 1).padStart(2, "0")}T09:00:00.000Z`,
        orchestrationId: `o${index}`,
      }),
    ),
    episodes: indexes.map((index) =>
      orchestration({ id: `o${index}`, scheduleId, runIds: [`fire-${index}`] }),
    ),
  };
}

function scheduleRuns(item: RailItem | undefined): RunSummary[] {
  return item?.kind === "schedule" ? item.runs : [];
}

function scheduleTotal(item: RailItem | undefined): number {
  return item?.kind === "schedule" ? item.totalRuns : 0;
}

function initiativeRuns(item: RailItem | undefined): RunSummary[] {
  return item?.kind === "initiative" ? item.runs : [];
}

function railItemId(item: RailItem): string {
  if (item.kind === "initiative") {
    return item.orchestration.id;
  }
  return item.kind === "schedule" ? item.schedule.id : item.run.id;
}

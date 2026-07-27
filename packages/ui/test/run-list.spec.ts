// Unit spec: the rail is fed by a snapshot plus a live stream, so a summary can
// arrive for a run the snapshot already holds (replace, keep position) or for one
// it has never seen (prepend — the server sorts newest first).
import { describe, expect, test } from "vitest";
import { HOME_PROJECT_ID } from "@adhd/core";
import type { RunStatus, RunSummary } from "@adhd/core";
import { firstActiveRunId, mergeSummaries, mergeSummary } from "../src/run-list";

function summary(id: string, status: RunStatus, number = 1): RunSummary {
  return {
    id,
    number,
    projectId: HOME_PROJECT_ID,
    pipelineId: "dev-test",
    pipelineName: "Developer + Tester",
    status,
    createdAt: "2026-07-27T10:00:00.000Z",
    stages: [],
  };
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

  test("an empty buffer leaves the snapshot alone", () => {
    const snapshot = [summary("a", "running")];
    expect(mergeSummaries(snapshot, [])).toEqual(snapshot);
  });
});

describe("firstActiveRunId", () => {
  test("finds the first run that has not reached a terminal status", () => {
    expect(
      firstActiveRunId([summary("done", "completed"), summary("live", "running")]),
    ).toBe("live");
  });

  test("a run awaiting a gate still counts as active", () => {
    expect(firstActiveRunId([summary("gate", "awaiting")])).toBe("gate");
  });

  test("returns null when every run is finished", () => {
    expect(
      firstActiveRunId([summary("a", "completed"), summary("b", "cancelled")]),
    ).toBeNull();
  });
});

import { describe, expect, test } from "vitest";
import { productManagerCloseoutSchema } from "../src/closeout.ts";
import { runArtifactsSchema, runArtifactRecordSchema } from "../src/run-artifacts.ts";

const ARTIFACTS = {
  summary: "Search shipped behind a flag",
  deliveredScope: ["Query parsing", "Result ranking"],
  decisions: ["Postgres full-text over a separate index"],
  knowledge: ["The seed script needs the extension installed first"],
  findings: [
    {
      id: "slow-cold-query",
      title: "First query after boot takes 4s",
      severity: "non_blocking",
      evidence: "packages/server/test/run/search.comp.ts",
    },
  ],
  nextRecommendation: "Warm the index on startup",
};

const CLOSEOUT = {
  ...ARTIFACTS,
  tasks: [
    {
      findingId: "slow-cold-query",
      title: "Warm the search index on boot",
      description: "Run one throwaway query during startup",
      priority: "P2",
      tags: ["server"],
    },
  ],
  completedTaskIds: ["TASK-001"],
  unresolvedTaskIds: [],
  cleanup: [{ relativePath: "browser-profile", reason: "Run-owned temporary profile" }],
};

describe("runArtifactsSchema", () => {
  test("a complete report keeps every field a later run reads", () => {
    const parsed = runArtifactsSchema.safeParse(ARTIFACTS);

    expect(parsed.success && parsed.data).toMatchObject({
      knowledge: ["The seed script needs the extension installed first"],
      nextRecommendation: "Warm the index on startup",
    });
  });

  test("the recommendation is optional — a run may have nothing to suggest", () => {
    const parsed = runArtifactsSchema.safeParse({
      ...ARTIFACTS,
      nextRecommendation: undefined,
    });

    expect(parsed.success).toBe(true);
  });

  test("the task-board fields belong to closeout and are refused here", () => {
    const parsed = runArtifactsSchema.safeParse(CLOSEOUT);

    expect(parsed.success).toBe(false);
  });

  test("a finding severity outside the roster is rejected", () => {
    const parsed = runArtifactsSchema.safeParse({
      ...ARTIFACTS,
      findings: [{ ...ARTIFACTS.findings[0], severity: "quite bad" }],
    });

    expect(parsed.success).toBe(false);
  });

  test("an empty summary is rejected — a report with nothing to say is not one", () => {
    const parsed = runArtifactsSchema.safeParse({ ...ARTIFACTS, summary: "" });

    expect(parsed.success).toBe(false);
  });
});

describe("runArtifactRecordSchema", () => {
  test("the record carries the report alongside how well it parsed", () => {
    const parsed = runArtifactRecordSchema.safeParse({
      report: ARTIFACTS,
      validationErrors: ["nextRecommendation: Expected string"],
      collectedAt: "2026-08-05T10:00:00.000Z",
    });

    expect(parsed.success && parsed.data.validationErrors).toHaveLength(1);
  });
});

describe("productManagerCloseoutSchema", () => {
  test("closeout still accepts a full report after sharing the artifacts shape", () => {
    const parsed = productManagerCloseoutSchema.safeParse(CLOSEOUT);

    expect(parsed.success && parsed.data).toMatchObject({
      completedTaskIds: ["TASK-001"],
      knowledge: ["The seed script needs the extension installed first"],
    });
  });

  test("a closeout missing the task-board fields is rejected — it is the superset", () => {
    const parsed = productManagerCloseoutSchema.safeParse(ARTIFACTS);

    expect(parsed.success).toBe(false);
  });
});

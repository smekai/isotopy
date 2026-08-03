import { describe, expect, it } from "vitest";
import {
  productManagerCloseoutSchema,
  runCloseoutRecordSchema,
} from "../src/closeout.ts";

const CLOSEOUT = {
  summary: "Delivered the feature.",
  deliveredScope: ["Feature"],
  decisions: [],
  knowledge: [],
  findings: [
    { id: "F1", title: "Flaky test", severity: "non_blocking" },
  ],
  tasks: [
    {
      findingId: "F1",
      title: "Stabilise the test",
      description: "It fails on Windows.",
      priority: "P2",
      tags: ["testing"],
    },
  ],
  completedTaskIds: [],
  unresolvedTaskIds: [],
  cleanup: [],
};

describe("productManagerCloseoutSchema", () => {
  it("accepts a well-formed closeout", () => {
    expect(productManagerCloseoutSchema.safeParse(CLOSEOUT).success).toBe(true);
  });

  it("rejects severity prose, because normalising it belongs to the agent boundary", () => {
    const parsed = productManagerCloseoutSchema.safeParse({
      ...CLOSEOUT,
      findings: [{ id: "F1", title: "Flaky test", severity: "Non-Blocking" }],
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects a follow-up task naming a finding that was never declared", () => {
    const parsed = productManagerCloseoutSchema.safeParse({
      ...CLOSEOUT,
      tasks: [{ ...CLOSEOUT.tasks[0], findingId: "F9" }],
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.path).toEqual(["tasks", 0, "findingId"]);
  });

  it("rejects an unknown key", () => {
    const parsed = productManagerCloseoutSchema.safeParse({
      ...CLOSEOUT,
      mood: "optimistic",
    });

    expect(parsed.success).toBe(false);
  });

  it("keeps duplicate scope entries, because deduping is an agent-boundary concern", () => {
    const parsed = productManagerCloseoutSchema.safeParse({
      ...CLOSEOUT,
      deliveredScope: ["Feature", "Feature"],
    });

    expect(parsed.success).toBe(true);
    expect(parsed.data?.deliveredScope).toEqual(["Feature", "Feature"]);
  });
});

describe("runCloseoutRecordSchema", () => {
  const record = {
    report: CLOSEOUT,
    createdTasks: [{ id: "TASK-001", title: "Stabilise", backend: "taskplanner" }],
    cleanup: { removed: [], rejected: [] },
    validationErrors: [],
    completedAt: "2026-08-03T10:00:00.000Z",
  };

  it("round-trips a record ADHD wrote itself", () => {
    expect(runCloseoutRecordSchema.safeParse(record).success).toBe(true);
  });

  it("rejects an unknown task backend", () => {
    const parsed = runCloseoutRecordSchema.safeParse({
      ...record,
      createdTasks: [{ id: "TASK-001", title: "Stabilise", backend: "jira" }],
    });

    expect(parsed.success).toBe(false);
  });
});

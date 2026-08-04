// Core's closeout schema is the strict half of a deliberate pair: the agent
// boundary in the server salvages what an LLM wrote, and this one governs what
// ADHD itself persists. If core ever starts normalising, the two collapse into
// one lenient codec and the strict-on-the-way-to-disk guarantee is gone.
import { describe, expect, it } from "vitest";
import { productManagerCloseoutSchema } from "../src/closeout.ts";

const CLOSEOUT = {
  summary: "Delivered the feature.",
  deliveredScope: ["Feature"],
  decisions: [],
  knowledge: [],
  findings: [{ id: "F1", title: "Flaky test", severity: "non_blocking" }],
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
  it("stays transform-free: severity prose and duplicates are the agent boundary's job", () => {
    expect(
      productManagerCloseoutSchema.safeParse({
        ...CLOSEOUT,
        findings: [{ id: "F1", title: "Flaky test", severity: "Non-Blocking" }],
      }).success,
    ).toBe(false);

    const duplicated = productManagerCloseoutSchema.safeParse({
      ...CLOSEOUT,
      deliveredScope: ["Feature", "Feature"],
    });

    expect(duplicated.success).toBe(true);
    expect(duplicated.data?.deliveredScope).toEqual(["Feature", "Feature"]);
  });

  it("rejects a follow-up task naming a finding that was never declared", () => {
    const parsed = productManagerCloseoutSchema.safeParse({
      ...CLOSEOUT,
      tasks: [{ ...CLOSEOUT.tasks[0], findingId: "F9" }],
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.path).toEqual(["tasks", 0, "findingId"]);
  });
});

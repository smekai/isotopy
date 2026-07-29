import { describe, expect, it } from "vitest";
import { parseMilestonePlan } from "../src/domain/milestone-plan.ts";

const VALID_PLAN = {
  name: "Milestone D",
  goal: "Ship planning",
  features: [
    {
      id: "planning",
      title: "Conversational planning",
      description: "Create and approve a plan",
      acceptanceCriteria: ["The proposal is editable"],
      existingTaskIds: [],
      taskDrafts: [
        {
          id: "planner-api",
          title: "Add planner API",
          description: "Create the planning endpoint.",
          priority: "P0",
          tags: ["server"],
        },
      ],
    },
  ],
};

describe("parseMilestonePlan", () => {
  it("parses a complete fenced plan", () => {
    const parsed = parseMilestonePlan(
      `Summary\n\n\`\`\`adhd-milestone-plan\n${JSON.stringify(VALID_PLAN)}\n\`\`\``,
      2,
      "2026-07-29T00:00:00.000Z",
    );

    expect(parsed.errors).toEqual([]);
    expect(parsed.proposal).toMatchObject({
      revision: 2,
      name: "Milestone D",
      features: [{ id: "planning" }],
    });
  });

  it("rejects features without acceptance criteria or work", () => {
    const invalid = {
      ...VALID_PLAN,
      features: [
        {
          ...VALID_PLAN.features[0],
          acceptanceCriteria: [],
          taskDrafts: [],
        },
      ],
    };

    const parsed = parseMilestonePlan(
      `\`\`\`adhd-milestone-plan\n${JSON.stringify(invalid)}\n\`\`\``,
      1,
      "2026-07-29T00:00:00.000Z",
    );

    expect(parsed.proposal).toBeUndefined();
    expect(parsed.errors).toHaveLength(1);
  });
});

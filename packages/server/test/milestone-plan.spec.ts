import { describe, expect, it } from "vitest";
import { extractMilestonePlan } from "../src/domain/milestone-plan.ts";
import { formatValidationIssues } from "../src/domain/validation.ts";

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

function fenced(plan: unknown): string {
  return `\`\`\`adhd-milestone-plan\n${JSON.stringify(plan)}\n\`\`\``;
}

describe("extractMilestonePlan", () => {
  it("parses a complete fenced plan", () => {
    const parsed = extractMilestonePlan(`Summary\n\n${fenced(VALID_PLAN)}`);

    expect(parsed.ok).toBe(true);
    expect(parsed.ok && parsed.value).toMatchObject({
      name: "Milestone D",
      features: [{ id: "planning" }],
    });
  });

  it("reports a missing fenced block rather than throwing", () => {
    const parsed = extractMilestonePlan("The plan is in my head.");

    expect(parsed.ok).toBe(false);
    expect(parsed.ok === false && formatValidationIssues(parsed.issues)).toContain(
      "Missing fenced adhd-milestone-plan JSON block",
    );
  });

  it("reports a block that is not valid JSON", () => {
    const parsed = extractMilestonePlan("```adhd-milestone-plan\n{ nope }\n```");

    expect(parsed.ok).toBe(false);
    expect(parsed.ok === false && formatValidationIssues(parsed.issues)).toContain(
      "valid JSON",
    );
  });

  it("rejects features without acceptance criteria or work", () => {
    const parsed = extractMilestonePlan(
      fenced({
        ...VALID_PLAN,
        features: [
          { ...VALID_PLAN.features[0], acceptanceCriteria: [], taskDrafts: [] },
        ],
      }),
    );

    expect(parsed.ok).toBe(false);
    expect(parsed.ok === false && parsed.issues.length).toBeGreaterThanOrEqual(1);
  });

  it("rejects malformed nested task data instead of dropping it", () => {
    const parsed = extractMilestonePlan(
      fenced({
        ...VALID_PLAN,
        features: [
          {
            ...VALID_PLAN.features[0]!,
            taskDrafts: [
              { ...VALID_PLAN.features[0]!.taskDrafts[0]!, priority: "urgent" },
            ],
          },
        ],
      }),
    );

    expect(parsed.ok).toBe(false);
    expect(parsed.ok === false && formatValidationIssues(parsed.issues)).toContain(
      "priority",
    );
  });

  it("rejects duplicate feature ids", () => {
    const parsed = extractMilestonePlan(
      fenced({
        ...VALID_PLAN,
        features: [VALID_PLAN.features[0], VALID_PLAN.features[0]],
      }),
    );

    expect(parsed.ok).toBe(false);
    expect(parsed.ok === false && formatValidationIssues(parsed.issues)).toContain(
      "Feature IDs must be unique",
    );
  });
});

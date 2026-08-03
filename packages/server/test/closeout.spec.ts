import { describe, expect, it } from "vitest";
import { parseProductManagerCloseout } from "../src/domain/closeout.ts";

const VALID_CLOSEOUT = {
  summary: "Delivered the feature.",
  deliveredScope: ["Feature"],
  decisions: [],
  knowledge: [],
  findings: [
    {
      id: "finding",
      title: "A finding",
      severity: "non_blocking",
    },
  ],
  tasks: [],
  completedTaskIds: [],
  unresolvedTaskIds: [],
  cleanup: [],
};

describe("parseProductManagerCloseout", () => {
  it("returns a strict typed closeout from the external JSON boundary", () => {
    const parsed = parseProductManagerCloseout(
      `\`\`\`adhd-closeout\n${JSON.stringify(VALID_CLOSEOUT)}\n\`\`\``,
    );

    expect(parsed.validationErrors).toEqual([]);
    expect(parsed.report.findings).toEqual([
      {
        id: "finding",
        title: "A finding",
        severity: "non_blocking",
      },
    ]);
  });

  it("accepts the hyphenated severity an agent writes and keeps the whole report", () => {
    const input = {
      ...VALID_CLOSEOUT,
      findings: [{ ...VALID_CLOSEOUT.findings[0], severity: "Non-Blocking" }],
      tasks: [
        {
          findingId: "finding",
          title: "Follow-up",
          description: "Fix the finding",
          priority: "P1",
          tags: ["server"],
        },
      ],
    };

    const parsed = parseProductManagerCloseout(
      `\`\`\`adhd-closeout\n${JSON.stringify(input)}\n\`\`\``,
    );

    expect(parsed.validationErrors).toEqual([]);
    expect(parsed.report.findings[0]?.severity).toBe("non_blocking");
    expect(parsed.report.tasks).toHaveLength(1);
    expect(parsed.report.summary).toBe("Delivered the feature.");
  });

  it("rejects a malformed nested finding instead of silently removing it", () => {
    const input = {
      ...VALID_CLOSEOUT,
      findings: [{ ...VALID_CLOSEOUT.findings[0], severity: "maybe" }],
    };

    const parsed = parseProductManagerCloseout(
      `\`\`\`adhd-closeout\n${JSON.stringify(input)}\n\`\`\``,
    );

    expect(parsed.report.findings).toEqual([]);
    expect(parsed.validationErrors[0]).toContain("findings.0.severity");
  });
});

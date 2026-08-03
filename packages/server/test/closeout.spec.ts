import { describe, expect, it } from "vitest";
import {
  parseProductManagerCloseout,
  productManagerCloseoutSchema,
} from "../src/domain/closeout.ts";

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

  it("keeps the fields that parsed when one follow-up task is malformed", () => {
    const input = {
      ...VALID_CLOSEOUT,
      tasks: [
        {
          findingId: "finding",
          title: "Follow-up",
          description: "Fix the finding",
          priority: "URGENT",
          tags: ["server"],
        },
      ],
      nextRecommendation: "Ship the next feature",
    };

    const parsed = parseProductManagerCloseout(
      `\`\`\`adhd-closeout\n${JSON.stringify(input)}\n\`\`\``,
    );

    expect(parsed.report.summary).toBe("Delivered the feature.");
    expect(parsed.report.deliveredScope).toEqual(["Feature"]);
    expect(parsed.report.findings).toHaveLength(1);
    expect(parsed.report.nextRecommendation).toBe("Ship the next feature");
    expect(parsed.report.tasks).toEqual([]);
    expect(parsed.validationErrors).toEqual([
      expect.stringContaining("tasks.0.priority"),
    ]);
  });

  it("keeps the report when the agent adds a key the schema does not know", () => {
    const input = { ...VALID_CLOSEOUT, confidence: "high" };

    const parsed = parseProductManagerCloseout(
      `\`\`\`adhd-closeout\n${JSON.stringify(input)}\n\`\`\``,
    );

    expect(parsed.report.summary).toBe("Delivered the feature.");
    expect(parsed.report.findings).toHaveLength(1);
    expect(parsed.validationErrors).toEqual(["confidence: Unrecognized key"]);
  });

  it("drops a follow-up task whose finding did not survive, naming both", () => {
    const input = {
      ...VALID_CLOSEOUT,
      findings: [{ ...VALID_CLOSEOUT.findings[0], severity: "maybe" }],
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

    expect(parsed.report.tasks).toEqual([]);
    expect(parsed.validationErrors).toEqual([
      expect.stringContaining("findings.0.severity"),
      expect.stringContaining('"Follow-up" references undeclared finding finding'),
    ]);
  });

  it("salvages into a report the strict persisted schema still accepts", () => {
    const input = {
      ...VALID_CLOSEOUT,
      confidence: "high",
      decisions: "not an array",
      cleanup: [{ relativePath: "tmp", reason: "scratch" }, { relativePath: "" }],
    };

    const parsed = parseProductManagerCloseout(
      `\`\`\`adhd-closeout\n${JSON.stringify(input)}\n\`\`\``,
    );

    expect(parsed.validationErrors).toEqual([
      "confidence: Unrecognized key",
      expect.stringContaining("decisions:"),
      expect.stringContaining("cleanup.1.relativePath"),
      expect.stringContaining("cleanup.1.reason"),
    ]);
    expect(parsed.report.cleanup).toEqual([
      { relativePath: "tmp", reason: "scratch" },
    ]);
    expect(productManagerCloseoutSchema.safeParse(parsed.report).success).toBe(true);
  });

  it("keeps nothing when the block is not an object at all", () => {
    const parsed = parseProductManagerCloseout(
      '```adhd-closeout\n["not", "a", "closeout"]\n```',
    );

    expect(parsed.report.findings).toEqual([]);
    expect(parsed.validationErrors[0]).toContain("closeout:");
  });
});

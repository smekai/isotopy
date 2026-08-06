import { describe, expect, it } from "vitest";
import { productManagerCloseoutSchema } from "@adhd/core";
import { parseProductManagerCloseout } from "../../src/domain/rules/closeout.ts";

const VALID_CLOSEOUT = {
  summary: "Delivered the feature.",
  deliveredScope: ["Feature"],
  decisions: [],
  knowledge: [],
  findings: [{ id: "finding", title: "A finding", severity: "non_blocking" }],
  tasks: [],
  completedTaskIds: [],
  unresolvedTaskIds: [],
  cleanup: [],
};

function parseBlock(input: unknown) {
  return parseProductManagerCloseout(
    `\`\`\`adhd-closeout\n${JSON.stringify(input)}\n\`\`\``,
  );
}

describe("parseProductManagerCloseout", () => {
  it("parses a whole closeout, including the hyphenated severity an agent writes", () => {
    const parsed = parseBlock({
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
    });

    expect(parsed.validationErrors).toEqual([]);
    expect(parsed.report.summary).toBe("Delivered the feature.");
    expect(parsed.report.findings[0]?.severity).toBe("non_blocking");
    expect(parsed.report.tasks).toHaveLength(1);
  });

  it("keeps every field and element that parsed, and names each one that did not", () => {
    const parsed = parseBlock({
      ...VALID_CLOSEOUT,
      confidence: "high",
      deliveredScope: ["Feature", 123],
      decisions: ["Chose SQLite", "  "],
      findings: [
        VALID_CLOSEOUT.findings[0],
        { id: "bad", title: "Unusable", severity: "maybe" },
      ],
      tasks: [
        {
          findingId: "bad",
          title: "Orphan",
          description: "References the discarded finding",
          priority: "P1",
          tags: [],
        },
      ],
      cleanup: [{ relativePath: "tmp", reason: "scratch" }, { relativePath: "" }],
    });

    expect(parsed.report.summary).toBe("Delivered the feature.");
    expect(parsed.report.deliveredScope).toEqual(["Feature"]);
    expect(parsed.report.decisions).toEqual(["Chose SQLite"]);
    expect(parsed.report.findings).toEqual([VALID_CLOSEOUT.findings[0]]);
    expect(parsed.report.tasks).toEqual([]);
    expect(parsed.report.cleanup).toEqual([{ relativePath: "tmp", reason: "scratch" }]);
    expect(parsed.validationErrors).toEqual(
      expect.arrayContaining([
        "confidence: Unrecognized key",
        expect.stringContaining("deliveredScope.1"),
        expect.stringContaining("decisions.1"),
        expect.stringContaining("findings.1.severity"),
        expect.stringContaining("cleanup.1.relativePath"),
        expect.stringContaining("cleanup.1.reason"),
        expect.stringContaining('"Orphan" references undeclared finding bad'),
      ]),
    );
    expect(parsed.validationErrors).toHaveLength(7);
    expect(productManagerCloseoutSchema.safeParse(parsed.report).success).toBe(true);
  });

  it("falls back to the raw output when the block is missing or unusable", () => {
    expect(parseProductManagerCloseout("No block here.").validationErrors).toEqual([
      "Missing fenced adhd-closeout JSON block",
    ]);
    expect(parseProductManagerCloseout("```adhd-closeout\n{oops\n```").validationErrors)
      .toEqual(["adhd-closeout block is not valid JSON"]);
    expect(parseBlock(["not", "a", "closeout"]).validationErrors[0]).toContain(
      "closeout:",
    );
  });
});

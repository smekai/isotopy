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

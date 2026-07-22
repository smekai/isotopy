// Unit spec: cross-box context is pure string handling, and `parseStageVerdict`
// in particular is subtle enough to deserve one — it scans backwards precisely
// because the persona text and a box's own prose both contain the literal
// strings it is looking for.
import { describe, expect, test } from "vitest";
import {
  buildStagePrompt,
  formatHandoff,
  parseStageVerdict,
} from "../src/domain/stage-context.js";

describe("parseStageVerdict", () => {
  test("reads a bare verdict line", () => {
    expect(parseStageVerdict("All good.\n\nVERDICT: PASS")).toBe("PASS");
    expect(parseStageVerdict("Broken.\n\nVERDICT: FAIL")).toBe("FAIL");
  });

  test("sees through the markdown wrapping real runs produce", () => {
    expect(parseStageVerdict("**VERDICT: PASS**")).toBe("PASS");
    expect(parseStageVerdict("`VERDICT: FAIL`")).toBe("FAIL");
    expect(parseStageVerdict("_VERDICT: PASS_")).toBe("PASS");
  });

  test("normalises case", () => {
    expect(parseStageVerdict("verdict: pass")).toBe("PASS");
  });

  test("handles CRLF output", () => {
    // Windows engine output is \r\n; without the strip this returns undefined.
    expect(parseStageVerdict("Checked it.\r\nVERDICT: PASS\r\n")).toBe("PASS");
  });

  test("takes the last verdict line, not the first", () => {
    // The persona text itself names both outcomes, and a report can revise
    // itself — the final standalone line is the one that counts.
    const output = ["VERDICT: PASS", "on reflection, no", "VERDICT: FAIL"].join("\n");
    expect(parseStageVerdict(output)).toBe("FAIL");
  });

  test("ignores a verdict mentioned inside prose", () => {
    expect(parseStageVerdict("I would report VERDICT: FAIL if the test broke.")).toBeUndefined();
  });

  test("returns undefined when there is no verdict at all", () => {
    // How a box without a verdict contract (the Developer) stays exit-code governed.
    expect(parseStageVerdict("Implemented the feature.")).toBeUndefined();
    expect(parseStageVerdict("")).toBeUndefined();
    expect(parseStageVerdict(undefined)).toBeUndefined();
  });
});

describe("buildStagePrompt", () => {
  test("passes the task through untouched when nothing ran before", () => {
    // A single-box run's prompt must be exactly what the user typed.
    expect(buildStagePrompt("add a greet function", [])).toBe("add a greet function");
  });

  test("adds a handoff block per upstream box, in order", () => {
    const prompt = buildStagePrompt("add a greet function", [
      { label: "Developer", output: "wrote greet.js" },
      { label: "Reviewer", output: "looks fine" },
    ]);

    expect(prompt).toContain("## Task\n\nadd a greet function");
    expect(prompt).toContain("## Handoff from previous steps");
    expect(prompt.indexOf("### Developer")).toBeLessThan(prompt.indexOf("### Reviewer"));
    expect(prompt).toContain("wrote greet.js");
  });

  test("drops upstream boxes that produced nothing", () => {
    const prompt = buildStagePrompt("task", [
      { label: "Developer", output: "   " },
      { label: "Reviewer", output: "looks fine" },
    ]);

    expect(prompt).not.toContain("### Developer");
    expect(prompt).toContain("### Reviewer");
  });

  test("returns the bare task when every upstream output is empty", () => {
    expect(buildStagePrompt("task", [{ label: "Developer", output: "" }])).toBe("task");
  });
});

describe("formatHandoff", () => {
  test("records provenance above the report", () => {
    const handoff = formatHandoff(
      {
        stageLabel: "Developer",
        profession: "Developer",
        engine: "Claude Code",
        model: "haiku",
        completedAt: "2026-07-21T10:00:00.000Z",
      },
      "  wrote greet.js  ",
    );

    expect(handoff).toContain("# Developer — handoff");
    expect(handoff).toContain("- **Engine:** Claude Code · haiku");
    expect(handoff).toContain("- **Completed:** 2026-07-21T10:00:00.000Z");
    expect(handoff).toContain("wrote greet.js");
  });

  test("omits the model when the run did not pin one", () => {
    const handoff = formatHandoff(
      {
        stageLabel: "Tester",
        profession: "Tester",
        engine: "Codex",
        completedAt: "2026-07-21T10:00:00.000Z",
      },
      "all green",
    );

    expect(handoff).toContain("- **Engine:** Codex\n");
  });
});

import { describe, expect, test } from "vitest";
import { DIRS, RUN_PILL, WARN_AMBER, runDot, runStatusLabel } from "../../src/theme";

describe("needs-attention presentation", () => {
  test("uses a readable label and warning treatment", () => {
    expect(runStatusLabel("needs_attention")).toBe("NEEDS ATTENTION");
    expect(RUN_PILL.needs_attention.text).toBe(WARN_AMBER);
    expect(runDot("needs_attention", DIRS.indigo)).toBe(WARN_AMBER);
  });
});

import { describe, expect, test } from "vitest";
import { isTerminalRunStatus } from "../src/runs.ts";

describe("isTerminalRunStatus", () => {
  test("treats needs attention as terminal", () => {
    expect(isTerminalRunStatus("needs_attention")).toBe(true);
  });
});

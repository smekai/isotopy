import { expect, test } from "vitest";
import {
  ORCHESTRATOR_CONTEXT_LIMITS,
  reviseOrchestratorContext,
} from "../../src/domain/rules/orchestrator-context.ts";

const { lines: LINE_CAP, bytes: BYTE_CAP } = ORCHESTRATOR_CONTEXT_LIMITS;

test("CRLF input is stored as LF, and surrounding blank lines are dropped", () => {
  expect(reviseOrchestratorContext("\r\n- one\r\n- two\r\n\r\n")).toEqual({
    ok: true,
    text: "- one\n- two",
  });
});

test("a context exactly at the line cap is kept", () => {
  expect(reviseOrchestratorContext(linesOf(LINE_CAP)).ok).toBe(true);
});

test("a context one line over the cap is refused, naming its size", () => {
  expect(reviseOrchestratorContext(linesOf(LINE_CAP + 1))).toEqual({
    ok: false,
    reason: expect.stringContaining(`${LINE_CAP + 1} lines`),
  });
});

test("two-byte letters filling the byte cap exactly are kept", () => {
  expect(reviseOrchestratorContext("é".repeat(BYTE_CAP / 2)).ok).toBe(true);
});

test("the byte cap counts bytes, not characters, so one two-byte letter more is refused", () => {
  expect(reviseOrchestratorContext("é".repeat(BYTE_CAP / 2 + 1))).toEqual({
    ok: false,
    reason: expect.stringContaining(`${BYTE_CAP + 2} bytes`),
  });
});

function linesOf(count: number): string {
  return Array.from({ length: count }, (_, index) => `- note ${index + 1}`).join("\n");
}

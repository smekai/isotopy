import { expect, test } from "vitest";
import { lineDiff } from "../src/line-diff";

test("an added flow reads as added lines between the lines both versions keep", () => {
  const diff = lineDiff("roster:\nflows:\n  pair: []\n", "roster:\nflows:\n  pair: []\n  verify: []\n");

  expect(diff).toEqual([
    { kind: "same", text: "roster:" },
    { kind: "same", text: "flows:" },
    { kind: "same", text: "  pair: []" },
    { kind: "added", text: "  verify: []" },
  ]);
});

test("a changed line reads as the old one removed and the new one added", () => {
  const diff = lineDiff("a\n    engine: primary\nb", "a\n    engine: secondary\nb");

  expect(diff.map((line) => line.kind)).toEqual(["same", "removed", "added", "same"]);
});

test("CRLF in one version and LF in the other is not a change on every line", () => {
  expect(lineDiff("a\r\nb\r\n", "a\nb\n").every((line) => line.kind === "same")).toBe(true);
});

test("a team.md with nothing before it reads as entirely added", () => {
  expect(lineDiff("", "---\nroster: []").map((line) => line.kind)).toEqual(["added", "added"]);
});

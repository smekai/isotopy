// A persona that relearns the same fact about a project every run is the problem
// TASK-113 exists to fix. Notes are the persona's own: written by it, replayed to
// it, and never handed to another role.
import { expect, test } from "vitest";
import {
  mergePersonaNotes,
  parsePersonaNotes,
  renderPersonaNotes,
} from "../src/domain/rules/persona-notes.ts";
import { extractPersonaNotes } from "../src/schemas/persona-notes.ts";

test("a handoff with no notes block asks for nothing to be written", () => {
  expect(extractPersonaNotes("Built it.\n\nVERDICT: PASS")).toBeUndefined();
});

test("a notes block is read out of the handoff around it", () => {
  const output = [
    "Built it.",
    "```isotopy-persona-notes",
    '{ "notes": ["Migrations live in db/migrate"] }',
    "```",
  ].join("\n");

  expect(extractPersonaNotes(output)).toMatchObject({
    ok: true,
    value: { notes: ["Migrations live in db/migrate"] },
  });
});

test("a malformed notes block is a rejection, not silently dropped", () => {
  const output = "```isotopy-persona-notes\n{ \"notes\": [] }\n```";

  expect(extractPersonaNotes(output)).toMatchObject({ ok: false });
});

test("a note the persona repeats is not written twice", () => {
  const merged = mergePersonaNotes(["Migrations live in db/migrate"], [
    "Migrations live in db/migrate",
  ]);

  expect(merged).toEqual(["Migrations live in db/migrate"]);
});

test("a repeated note moves to the end, because the newest run confirmed it", () => {
  const merged = mergePersonaNotes(["first", "second"], ["first"]);

  expect(merged).toEqual(["second", "first"]);
});

test("notes are capped so a persona's prompt cannot grow without bound", () => {
  const existing = Array.from({ length: 40 }, (_, index) => `note ${index}`);

  const merged = mergePersonaNotes(existing, ["the newest thing"]);

  expect(merged).toHaveLength(40);
  expect(merged.at(-1)).toBe("the newest thing");
  expect(merged).not.toContain("note 0");
});

test("notes round-trip through the file they are stored in", () => {
  const notes = ["Migrations live in db/migrate", "The seed script needs the extension"];

  expect(parsePersonaNotes(renderPersonaNotes(notes))).toEqual(notes);
});

test("a hand-edited notes file keeps only its bullets, so prose around them is ignored", () => {
  const edited = "# My notes\n\nSome prose.\n\n- A real fact\n";

  expect(parsePersonaNotes(edited)).toEqual(["A real fact"]);
});

test("a missing notes file reads as no notes rather than throwing", () => {
  expect(parsePersonaNotes(undefined)).toEqual([]);
});

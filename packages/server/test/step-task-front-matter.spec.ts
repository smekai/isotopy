// The front matter reader is hand-rolled rather than a YAML dependency, so what
// earns a spec is the set of shapes it deliberately refuses: anything it cannot
// represent must be reported, never quietly mis-read.
import { assert, expect, test } from "vitest";
import { parseStepTask } from "../src/schemas/step-task.ts";
import { formatValidationIssues } from "../src/domain/validation.ts";
import type { ParsedStepTask } from "../src/schemas/step-task.ts";
import type { ValidationResult } from "../src/domain/validation.ts";

const DECLARED = [
  "---",
  "agent: tester",
  "summary: Verify the implementation.",
  "context: [product-environment]",
  "---",
  "",
  "# Assignment: Verify",
  "",
  "Body prose.",
].join("\n");

test("a declared step task parses to its agent, summary and context", () => {
  const parsed = parseStepTask(DECLARED);

  expect(valueOf(parsed)).toMatchObject({
    agent: "tester",
    summary: "Verify the implementation.",
    context: ["product-environment"],
  });
});

test("the assignment excludes the front matter, which is Isotopy's to read and not the agent's", () => {
  const parsed = parseStepTask(DECLARED);

  expect(valueOf(parsed).assignment).toBe("# Assignment: Verify\n\nBody prose.");
});

test("a file with no front matter is a valid step task whose whole text is the assignment", () => {
  const parsed = parseStepTask("# Assignment: Do it\n\nBody prose.\n");

  expect(valueOf(parsed).assignment).toBe("# Assignment: Do it\n\nBody prose.");
});

test("a step task declares nothing internal unless it says so", () => {
  const parsed = parseStepTask("# Assignment: Do it");

  expect(valueOf(parsed).internal).toBe(false);
});

test("a block sequence is refused, naming the line that carried it", () => {
  const parsed = parseStepTask("---\ncontext:\n- product-environment\n---\n\nBody.");

  expect(issuesOf(parsed)).toContain(
    "frontMatter.3: Write a list inline as `key: [one, two]`, not as `- item`",
  );
});

// A typo'd key silently ignored is the failure strictness exists to prevent: the
// step would run without the tools or context it meant to declare.
test("an unknown key is refused rather than ignored", () => {
  const parsed = parseStepTask("---\nagents: developer\n---\n\nBody.");

  expect(issuesOf(parsed)).toContain('Unrecognized key: "agents"');
});

test("front matter that is never closed is refused rather than swallowing the assignment", () => {
  const parsed = parseStepTask("---\nagent: developer\n\n# Assignment: Do it");

  expect(issuesOf(parsed)).toBe(
    "frontMatter: Front matter is never closed by a `---` line",
  );
});

test("a duplicate key is refused, because neither value is obviously the intended one", () => {
  const parsed = parseStepTask("---\nagent: developer\nagent: tester\n---\n\nBody.");

  expect(issuesOf(parsed)).toBe("frontMatter.3: Duplicate key: agent");
});

test("a block scalar is refused, because the reader would take only its first line", () => {
  const parsed = parseStepTask("---\nsummary: |\n  Long text\n---\n\nBody.");

  expect(issuesOf(parsed)).toContain(
    "frontMatter.2: `summary` uses a block scalar, which front matter here does not read",
  );
});

test("a context id outside the closed vocabulary is refused", () => {
  const parsed = parseStepTask("---\ncontext: [production-database]\n---\n\nBody.");

  expect(issuesOf(parsed)).toContain("context.0:");
});

function valueOf(parsed: ValidationResult<ParsedStepTask>): ParsedStepTask {
  assert(parsed.ok, "expected the step task to parse");
  return parsed.value;
}

function issuesOf(parsed: ValidationResult<ParsedStepTask>): string {
  assert(!parsed.ok, "expected the step task to be refused");
  return formatValidationIssues(parsed.issues);
}

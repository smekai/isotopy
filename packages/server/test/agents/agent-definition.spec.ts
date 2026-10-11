// An agent or step is a markdown file whose YAML front matter is its catalog entry.
// The parser is the one boundary every bundled, project and pack file passes through,
// so each way a hand-written file can go wrong is pinned here.
import { expect, test } from "vitest";
import { parseAgentFile, parseStepFile } from "../../src/schemas/agent-definition.ts";

const BODY = "# Role: Growth Marketer\n\nYou find the people a product is for.";

test("a persona file yields its catalog entry and a body without the front matter", () => {
  const parsed = parseAgentFile("growth-marketer", agentFile());

  expect(parsed).toEqual({
    ok: true,
    value: {
      id: "growth-marketer",
      title: "Growth Marketer",
      glyph: "✶",
      description: "Finds the people a product is for.",
      body: BODY,
    },
  });
});

test("a CRLF checkout parses to the same entry as LF", () => {
  const parsed = parseAgentFile("growth-marketer", agentFile().replace(/\n/g, "\r\n"));

  expect(parsed).toEqual(parseAgentFile("growth-marketer", agentFile()));
});

test("a byte-order mark before the fence does not hide the front matter", () => {
  const parsed = parseAgentFile("growth-marketer", `\uFEFF${agentFile()}`);

  expect(parsed).toMatchObject({ ok: true, value: { title: "Growth Marketer" } });
});

test("a file with no front matter is refused rather than read as an untitled persona", () => {
  expect(parseAgentFile("growth-marketer", BODY)).toMatchObject({ ok: false });
});

test("front matter that never closes is refused rather than swallowing the body", () => {
  const unclosed = agentFile().replace("---\n# Role", "# Role");

  expect(parseAgentFile("growth-marketer", unclosed)).toMatchObject({ ok: false });
});

test("front matter that is not YAML is refused with the parser's reason", () => {
  const parsed = parseAgentFile("growth-marketer", agentFile({ title: "[Growth" }));

  expect(parsed).toMatchObject({ ok: false, issues: [{ message: /YAML/ }] });
});

test("an alias is refused, so a small file cannot expand into a huge document", () => {
  const aliased = agentFile({ title: "&name Growth Marketer", description: "*name" });

  expect(parseAgentFile("growth-marketer", aliased)).toMatchObject({ ok: false });
});

test("an unknown key is refused, so a misspelt field is not silently ignored", () => {
  const parsed = parseAgentFile("growth-marketer", agentFile({ titel: "Growth Marketer" }));

  expect(parsed).toMatchObject({ ok: false });
});

test("a name that is not the file's own id is refused, so one file cannot claim another agent", () => {
  const parsed = parseAgentFile("growth-marketer", agentFile({ name: "developer" }));

  expect(parsed).toMatchObject({ ok: false, issues: [{ path: ["name"] }] });
});

test("a later --- line is a horizontal rule in the body, not a second block", () => {
  const withRule = `${agentFile()}\n\n---\n\nname: not front matter`;

  expect(parseAgentFile("growth-marketer", withRule)).toMatchObject({
    ok: true,
    value: { body: `${BODY}\n\n---\n\nname: not front matter` },
  });
});

test("a step is composable unless its file says otherwise", () => {
  const parsed = parseStepFile("plan-campaign", stepFile());

  expect(parsed).toMatchObject({ ok: true, value: { composable: true } });
});

test("an internal step declares itself not composable", () => {
  const parsed = parseStepFile("plan-campaign", stepFile({ composable: "false" }));

  expect(parsed).toMatchObject({ ok: true, value: { composable: false } });
});

function agentFile(fields: Record<string, string> = {}): string {
  return frontMatter(
    {
      name: "growth-marketer",
      title: "Growth Marketer",
      glyph: '"✶"',
      description: "Finds the people a product is for.",
      ...fields,
    },
    BODY,
  );
}

function stepFile(fields: Record<string, string> = {}): string {
  return frontMatter(
    { name: "plan-campaign", description: "Plan one campaign for one audience.", ...fields },
    "# Assignment: Plan a campaign",
  );
}

function frontMatter(fields: Record<string, string>, body: string): string {
  const lines = Object.entries(fields).map(([key, value]) => `${key}: ${value}`);
  return ["---", ...lines, "---", body].join("\n");
}

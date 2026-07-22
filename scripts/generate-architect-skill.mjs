// Generates the two Architect consumers from the single canonical source,
// docs/architect-standards.md. Run `pnpm gen:skills`; pass --check to verify the
// committed outputs match the source without writing (used by the drift test).
//
// Dependency-free Node ESM so it runs identically on Windows and macOS.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = path.join(ROOT, "docs", "architect-standards.md");
const SKILL_OUT = path.join(ROOT, ".claude", "skills", "architect", "SKILL.md");
const PERSONA_OUT = path.join(
  ROOT,
  "packages",
  "server",
  "src",
  "domain",
  "skills",
  "architect.generated.ts",
);

const SKILL_DESCRIPTION =
  "The prescriptive code standard for this repo — comments-as-smell, SOLID, " +
  "DDD layering, workflow seams, named types, strict TypeScript. Load when " +
  "writing or refactoring code here.";

function extractBlock(markdown, name) {
  const pattern = new RegExp(
    `<!-- gen:${name}:start -->\\n([\\s\\S]*?)\\n<!-- gen:${name}:end -->`,
  );
  const match = pattern.exec(markdown);
  if (!match) {
    throw new Error(`generate-architect-skill: missing gen block "${name}" in ${SOURCE}`);
  }
  return match[1].trim();
}

function buildSkillMarkdown(blocks) {
  return [
    "---",
    "name: architect",
    `description: ${SKILL_DESCRIPTION}`,
    "---",
    "",
    "# Architect — how code in this repo must be written",
    "",
    "> Generated from `docs/architect-standards.md`. Do not edit here — edit the",
    "> source and run `pnpm gen:skills`.",
    "",
    blocks.shared,
    "",
    blocks.skill,
    "",
  ].join("\n");
}

function buildPersonaText(blocks) {
  return [blocks.personaHead, "", blocks.shared, "", blocks.personaTail].join("\n") + "\n";
}

function toTemplateLiteral(text) {
  const escaped = text.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
  return "`" + escaped + "`";
}

function buildPersonaModule(personaText) {
  return [
    "// GENERATED FILE — do not edit by hand.",
    "// Source: docs/architect-standards.md · regenerate with `pnpm gen:skills`.",
    "// Drift from the source is caught by architect-skill.spec.ts.",
    "",
    "/** The Architect persona, seeded into `.adhd/skills/architect.md`. */",
    `export const ARCHITECT_SKILL = ${toTemplateLiteral(personaText)};`,
    "",
  ].join("\n");
}

async function readOutputs() {
  const markdown = await readFile(SOURCE, "utf8");
  const blocks = {
    shared: extractBlock(markdown, "shared"),
    skill: extractBlock(markdown, "skill"),
    personaHead: extractBlock(markdown, "persona-head"),
    personaTail: extractBlock(markdown, "persona-tail"),
  };
  return {
    skill: buildSkillMarkdown(blocks),
    persona: buildPersonaModule(buildPersonaText(blocks)),
  };
}

async function fileMatches(filePath, expected) {
  try {
    return (await readFile(filePath, "utf8")) === expected;
  } catch {
    return false;
  }
}

async function main() {
  const check = process.argv.includes("--check");
  const outputs = await readOutputs();
  const targets = [
    [SKILL_OUT, outputs.skill],
    [PERSONA_OUT, outputs.persona],
  ];

  if (check) {
    const stale = [];
    for (const [filePath, expected] of targets) {
      if (!(await fileMatches(filePath, expected))) {
        stale.push(path.relative(ROOT, filePath));
      }
    }
    if (stale.length > 0) {
      console.error(`Architect skill out of date: ${stale.join(", ")}. Run \`pnpm gen:skills\`.`);
      process.exit(1);
    }
    console.log("Architect skill outputs are up to date.");
    return;
  }

  for (const [filePath, expected] of targets) {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, expected);
    console.log(`wrote ${path.relative(ROOT, filePath)}`);
  }
}

await main();

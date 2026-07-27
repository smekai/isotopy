// Generates every bundled persona and the Architect skill from their markdown
// sources. Run `pnpm gen:skills`; pass --check to verify the committed outputs
// match without writing (used by the drift test).
//
// Personas are markdown so they read and diff like the documents they are, but
// they ship as one generated TS module: the server compiles with plain `tsc`,
// which does not copy .md into dist/, and a runtime file read would put the
// shipped source of truth outside the bundle.
//
// Dependency-free Node ESM so it runs identically on Windows and macOS.
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STANDARDS = path.join(ROOT, "docs", "architecture.md");
const PERSONA_DIR = path.join(ROOT, "packages", "server", "src", "domain", "skills", "personas");
const SKILL_OUT = path.join(ROOT, ".claude", "skills", "architect", "SKILL.md");
const DEFAULTS_OUT = path.join(
  ROOT,
  "packages",
  "server",
  "src",
  "domain",
  "skills",
  "defaults.generated.ts",
);

const SKILL_DESCRIPTION =
  "The prescriptive code standard for this repo — comments-as-smell, SOLID, " +
  "DDD layering, workflow seams, named types, strict TypeScript. Load when " +
  "writing or refactoring code here.";

const ARCHITECT_ID = "architect";

function extractBlock(markdown, name) {
  const pattern = new RegExp(
    `<!-- gen:${name}:start -->\\n([\\s\\S]*?)\\n<!-- gen:${name}:end -->`,
  );
  const match = pattern.exec(markdown);
  if (!match) {
    throw new Error(`generate-skills: missing gen block "${name}" in ${STANDARDS}`);
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
    "> Generated from `docs/architecture.md`. Do not edit here — edit the",
    "> source and run `pnpm gen:skills`.",
    "",
    blocks.shared,
    "",
    blocks.skill,
    "",
  ].join("\n");
}

function buildArchitectPersona(blocks) {
  return [blocks.personaHead, "", blocks.shared, "", blocks.personaTail].join("\n") + "\n";
}

function toTemplateLiteral(text) {
  const escaped = text.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
  return "`" + escaped + "`";
}

function buildDefaultsModule(personas) {
  const entries = [...personas.entries()].sort(([left], [right]) => left.localeCompare(right));
  return [
    "// GENERATED FILE — do not edit by hand.",
    "// Sources: packages/server/src/domain/skills/personas/*.md and the gen: blocks",
    "// in docs/architecture.md · regenerate with `pnpm gen:skills`.",
    "// Drift from the sources is caught by skill-generation.spec.ts.",
    "",
    "export const DEFAULT_SKILLS: Record<string, string> = {",
    // Keys are quoted because a persona id may be kebab-case (project-manager).
    ...entries.map(([id, text]) => `  ${JSON.stringify(id)}: ${toTemplateLiteral(text)},`),
    "};",
    "",
  ].join("\n");
}

async function readMarkdownPersonas() {
  const personas = new Map();
  const entries = await readdir(PERSONA_DIR);
  for (const entry of entries.filter((name) => name.endsWith(".md"))) {
    personas.set(path.basename(entry, ".md"), await readFile(path.join(PERSONA_DIR, entry), "utf8"));
  }
  return personas;
}

async function buildOutputs() {
  const markdown = await readFile(STANDARDS, "utf8");
  const blocks = {
    shared: extractBlock(markdown, "shared"),
    skill: extractBlock(markdown, "skill"),
    personaHead: extractBlock(markdown, "persona-head"),
    personaTail: extractBlock(markdown, "persona-tail"),
  };

  const personas = await readMarkdownPersonas();
  if (personas.has(ARCHITECT_ID)) {
    throw new Error(
      `generate-skills: ${ARCHITECT_ID} is composed from ${path.relative(ROOT, STANDARDS)};` +
        ` remove personas/${ARCHITECT_ID}.md`,
    );
  }
  personas.set(ARCHITECT_ID, buildArchitectPersona(blocks));

  return {
    skill: buildSkillMarkdown(blocks),
    defaults: buildDefaultsModule(personas),
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
  const outputs = await buildOutputs();
  const targets = [
    [SKILL_OUT, outputs.skill],
    [DEFAULTS_OUT, outputs.defaults],
  ];

  if (check) {
    const stale = [];
    for (const [filePath, expected] of targets) {
      if (!(await fileMatches(filePath, expected))) {
        stale.push(path.relative(ROOT, filePath));
      }
    }
    if (stale.length > 0) {
      console.error(`Bundled skills out of date: ${stale.join(", ")}. Run \`pnpm gen:skills\`.`);
      process.exit(1);
    }
    console.log("Bundled skill outputs are up to date.");
    return;
  }

  for (const [filePath, expected] of targets) {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, expected);
    console.log(`wrote ${path.relative(ROOT, filePath)}`);
  }
}

await main();

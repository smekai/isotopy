import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STANDARDS = path.join(ROOT, "docs", "architecture.md");
const SKILL_OUT = path.join(ROOT, ".claude", "skills", "architect", "SKILL.md");
const PERSONA_OUT = path.join(
  ROOT,
  "packages",
  "server",
  "src",
  "domain",
  "skills",
  "personas",
  "architect.md",
);

const SKILL_DESCRIPTION =
  "The prescriptive code standard for this repo — comments-as-smell, SOLID, " +
  "DDD layering, workflow seams, named types, strict TypeScript. Load when " +
  "writing or refactoring code here.";

function extractBlock(markdown, name) {
  const pattern = new RegExp(
    `<!-- gen:${name}:start -->\\r?\\n([\\s\\S]*?)\\r?\\n<!-- gen:${name}:end -->`,
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

async function buildOutputs() {
  const markdown = await readFile(STANDARDS, "utf8");
  const blocks = {
    shared: extractBlock(markdown, "shared"),
    skill: extractBlock(markdown, "skill"),
    personaHead: extractBlock(markdown, "persona-head"),
    personaTail: extractBlock(markdown, "persona-tail"),
  };

  return [
    [SKILL_OUT, buildSkillMarkdown(blocks)],
    [PERSONA_OUT, buildArchitectPersona(blocks)],
  ];
}

function normalizeLineEndings(value) {
  return value.replace(/\r\n/g, "\n");
}

async function fileMatches(filePath, expected) {
  try {
    return (
      normalizeLineEndings(await readFile(filePath, "utf8")) ===
      normalizeLineEndings(expected)
    );
  } catch {
    return false;
  }
}

async function main() {
  const check = process.argv.includes("--check");
  const outputs = await buildOutputs();

  if (check) {
    const stale = [];
    for (const [filePath, expected] of outputs) {
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

  for (const [filePath, expected] of outputs) {
    if (await fileMatches(filePath, expected)) {
      continue;
    }
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, expected);
    console.log(`wrote ${path.relative(ROOT, filePath)}`);
  }
}

await main();

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function docPath(name) {
  return path.join(ROOT, "docs", name);
}

function skillPath(name) {
  return path.join(ROOT, ".claude", "skills", name, "SKILL.md");
}

function personaPath(name) {
  return path.join(ROOT, "packages", "server", "src", "domain", "skills", "personas", name);
}

const ARCHITECT_DESCRIPTION =
  "The prescriptive code standard for this repo — comments-as-smell, SOLID, " +
  "DDD layering, workflow seams, named types, strict TypeScript. Load when " +
  "writing or refactoring code here.";

const WRITE_TESTS_DESCRIPTION =
  "How a test in this repo must be written — the AAAAA phases, one action per " +
  "test, no logic in a test body, generators over flag-driven factories, and " +
  "which layer a check belongs in. Load before adding or restructuring any test.";

function frontmatter(name, description) {
  return ["---", `name: ${name}`, `description: ${description}`, "---", ""];
}

function generatedBanner(source) {
  return [
    `> Generated from \`docs/${source}\`. Do not edit here — edit the`,
    "> source and run `pnpm gen:skills`.",
    "",
  ];
}

const SOURCES = [
  {
    source: "architecture.md",
    blocks: ["shared", "skill", "persona-head", "persona-tail"],
    outputs: (blocks) => [
      [
        skillPath("architect"),
        [
          ...frontmatter("architect", ARCHITECT_DESCRIPTION),
          "# Architect — how code in this repo must be written",
          "",
          ...generatedBanner("architecture.md"),
          blocks.shared,
          "",
          blocks.skill,
          "",
        ].join("\n"),
      ],
      [
        personaPath("architect.md"),
        [blocks["persona-head"], "", blocks.shared, "", blocks["persona-tail"]].join("\n") + "\n",
      ],
    ],
  },
  {
    source: "testing.md",
    blocks: ["testing-shared", "testing-skill", "tester-persona-head", "tester-persona-tail"],
    outputs: (blocks) => [
      [
        skillPath("write-tests"),
        [
          ...frontmatter("write-tests", WRITE_TESTS_DESCRIPTION),
          "# Writing a test in this repo",
          "",
          ...generatedBanner("testing.md"),
          blocks["testing-shared"],
          "",
          blocks["testing-skill"],
          "",
        ].join("\n"),
      ],
      [
        personaPath("tester.md"),
        [
          blocks["tester-persona-head"],
          "",
          blocks["testing-shared"],
          "",
          blocks["tester-persona-tail"],
        ].join("\n") + "\n",
      ],
    ],
  },
];

function extractBlock(markdown, name, source) {
  const pattern = new RegExp(
    `<!-- gen:${name}:start -->\\r?\\n([\\s\\S]*?)\\r?\\n<!-- gen:${name}:end -->`,
  );
  const match = pattern.exec(markdown);
  if (!match) {
    throw new Error(`generate-skills: missing gen block "${name}" in docs/${source}`);
  }
  return match[1].trim();
}

async function buildOutputs() {
  const built = [];
  for (const { source, blocks: names, outputs } of SOURCES) {
    const markdown = await readFile(docPath(source), "utf8");
    const blocks = Object.fromEntries(
      names.map((name) => [name, extractBlock(markdown, name, source)]),
    );
    built.push(...outputs(blocks));
  }
  return built;
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

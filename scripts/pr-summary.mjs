import { execFileSync } from "node:child_process";

const CATEGORIES = [
  { id: "source", label: "Source", match: (file) => /^packages\/[^/]+\/src\/.*\.tsx?$/.test(file) },
  { id: "tests", label: "Tests", match: (file) => /^packages\/[^/]+\/(test|e2e)\//.test(file) },
  { id: "board", label: "Task board", match: (file) => file.startsWith(".tasks/") },
  { id: "evidence", label: "Run evidence", match: (file) => file.startsWith("docs/dogfood/") },
  { id: "docs", label: "Docs", match: (file) => /\.md$/.test(file) },
  { id: "version", label: "Version", match: (file) => /(^|\/)package\.json$/.test(file) },
  { id: "other", label: "Other", match: () => true },
];

const CODE = new Set(["source", "tests"]);
const PROSE = new Set(["board", "evidence", "docs"]);

function baseRef() {
  const argument = process.argv[2];
  if (argument !== undefined) {
    return argument;
  }
  const candidates = ["origin/main", "main"];
  for (const candidate of candidates) {
    try {
      execFileSync("git", ["rev-parse", "--verify", candidate], { stdio: "ignore" });
      return candidate;
    } catch {
      continue;
    }
  }
  throw new Error("No base ref found — pass one explicitly: pnpm pr:summary <ref>");
}

function mergeBase(ref) {
  return execFileSync("git", ["merge-base", ref, "HEAD"], { encoding: "utf8" }).trim();
}

function changes(from) {
  const raw = execFileSync("git", ["diff", "--numstat", `${from}..HEAD`], { encoding: "utf8" });
  return raw
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [added, removed, file] = line.split("\t");
      return { file, added: Number(added) || 0, removed: Number(removed) || 0 };
    });
}

function categorize(entries) {
  const totals = new Map(CATEGORIES.map((category) => [category.id, { files: 0, added: 0, removed: 0 }]));
  for (const entry of entries) {
    const category = CATEGORIES.find((candidate) => candidate.match(entry.file));
    const bucket = totals.get(category.id);
    bucket.files += 1;
    bucket.added += entry.added;
    bucket.removed += entry.removed;
  }
  return totals;
}

function sumOf(totals, ids) {
  let added = 0;
  for (const [id, bucket] of totals) {
    if (ids.has(id)) {
      added += bucket.added;
    }
  }
  return added;
}

function table(totals) {
  const rows = CATEGORIES.filter((category) => totals.get(category.id).files > 0).map((category) => {
    const { files, added, removed } = totals.get(category.id);
    return `| ${category.label} | ${files} | +${added} | −${removed} |`;
  });
  return ["| Category | Files | Added | Removed |", "| --- | ---: | ---: | ---: |", ...rows].join("\n");
}

const from = mergeBase(baseRef());
const entries = changes(from);
if (entries.length === 0) {
  console.log("No changes against the base ref.");
  process.exit(0);
}
const totals = categorize(entries);
const code = sumOf(totals, CODE);
const prose = sumOf(totals, PROSE);

console.log(table(totals));
console.log("");
console.log(`Code (source + tests): +${code}`);
console.log(`Prose (board + evidence + docs): +${prose}`);
if (prose > code) {
  const ratio = code === 0 ? "∞" : (prose / code).toFixed(1);
  console.log("");
  console.log(
    `Prose outweighs code ${ratio}:1. The PR description must say why, or the prose must be cut.`,
  );
}

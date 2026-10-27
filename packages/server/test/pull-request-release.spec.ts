import { expect, test } from "vitest";
import {
  changeCategory,
  changeCounts,
  ciStateOf,
} from "../src/domain/rules/pull-request-release.ts";
import type { ChecksReport } from "../src/domain/rules/pull-request-release.ts";
import type { CheckBucket } from "../src/schemas/github-cli.ts";

test("one failing check fails CI even while others are still pending", () => {
  expect(ciStateOf(reported("pending", "fail"), 0)).toBe("failed");
});

test("a cancelled check counts as failed, not as passed", () => {
  expect(ciStateOf(reported("pass", "cancel"), 0)).toBe("failed");
});

test("skipped checks do not hold a pull request back", () => {
  expect(ciStateOf(reported("pass", "skipping"), 0)).toBe("passed");
});

test("no checks right after the push is pending, because CI may not have registered them yet", () => {
  expect(ciStateOf({ kind: "none" }, 0)).toBe("pending");
});

test("a repository that never reports a check passes once the grace polls are spent", () => {
  expect(ciStateOf({ kind: "none" }, 2)).toBe("passed");
});

test.each([
  [".tasks/DONE.md", "Task board"],
  [".isotopy/runs/ab12/artifacts/report.md", "Run evidence"],
  ["packages/app/test/search.comp.ts", "Tests"],
  ["src/search.test.tsx", "Tests"],
  ["docs/search.md", "Docs"],
  ["src/search.ts", "Source"],
  ["pnpm-lock.yaml", "Other"],
] as const)("%s is counted as %s", (file, category) => {
  expect(changeCategory(file)).toBe(category);
});

test("a binary file counts as a changed file with no lines", () => {
  const counts = changeCounts("-\t-\tassets/logo.png\n3\t1\tsrc/search.ts\n");

  expect(counts.filter((count) => count.files > 0)).toEqual([
    { category: "Source", files: 1, added: 3, removed: 1 },
    { category: "Other", files: 1, added: 0, removed: 0 },
  ]);
});

function reported(...buckets: CheckBucket[]): ChecksReport {
  return {
    kind: "reported",
    checks: buckets.map((bucket, index) => ({ name: `check-${index}`, bucket, link: "" })),
  };
}

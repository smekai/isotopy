import { expect, test } from "vitest";
import type { FileChange } from "@adhd/core";
import {
  diffSnapshots,
  mergeGitChanges,
  parseGitNameStatus,
  parseGitStatus,
  reportableChanges,
} from "../src/domain/rules/run-changes.ts";
import type { WorkspaceSnapshot } from "../src/utils/workspace-files.ts";

function snapshot(
  files: Record<string, [number, number]>,
  truncated = false,
): WorkspaceSnapshot {
  return {
    files: new Map(
      Object.entries(files).map(([path, [mtimeMs, size]]) => [path, { mtimeMs, size }]),
    ),
    truncated,
  };
}

function change(path: string, kind: FileChange["kind"]): FileChange {
  return { path, kind };
}

function nulJoined(...fields: string[]): string {
  return `${fields.join("\0")}\0`;
}

test("a file the run added appears as created", () => {
  const before = snapshot({ "README.md": [1, 10] });
  const after = snapshot({ "README.md": [1, 10], "src/app.ts": [2, 40] });

  expect(diffSnapshots(before, after)).toEqual([change("src/app.ts", "created")]);
});

test("a file whose modification time moved appears as edited", () => {
  const before = snapshot({ "src/app.ts": [1, 40] });
  const after = snapshot({ "src/app.ts": [2, 40] });

  expect(diffSnapshots(before, after)).toEqual([change("src/app.ts", "edited")]);
});

test("a file rewritten to the same length is still edited, because the size alone would hide it", () => {
  const before = snapshot({ "src/app.ts": [1, 40] });
  const after = snapshot({ "src/app.ts": [1, 41] });

  expect(diffSnapshots(before, after)).toEqual([change("src/app.ts", "edited")]);
});

test("a file the run removed appears as deleted", () => {
  const before = snapshot({ "old.txt": [1, 5] });
  const after = snapshot({});

  expect(diffSnapshots(before, after)).toEqual([change("old.txt", "deleted")]);
});

test("a workspace that did not move reports nothing rather than everything", () => {
  const unchanged = snapshot({ "a.ts": [1, 1], "b.ts": [2, 2] });

  expect(diffSnapshots(unchanged, unchanged)).toEqual([]);
});

test("an untracked path in git status is a file the run created", () => {
  expect(parseGitStatus(nulJoined("?? src/new.ts"))).toEqual([
    change("src/new.ts", "created"),
  ]);
});

test("a modified worktree entry is an edit", () => {
  expect(parseGitStatus(nulJoined(" M src/app.ts"))).toEqual([
    change("src/app.ts", "edited"),
  ]);
});

test("a staged deletion is a deletion, not an edit of the index", () => {
  expect(parseGitStatus(nulJoined("D  src/gone.ts"))).toEqual([
    change("src/gone.ts", "deleted"),
  ]);
});

test("a rename reports the new path as created and the old one as deleted", () => {
  expect(parseGitStatus(nulJoined("R  src/new.ts", "src/old.ts"))).toEqual([
    change("src/new.ts", "created"),
    change("src/old.ts", "deleted"),
  ]);
});

test("a file added then deleted before the run ended is not reported at all", () => {
  expect(parseGitStatus(nulJoined("AD scratch.tmp"))).toEqual([]);
});

test("name-status output pairs each code with the path that follows it", () => {
  expect(parseGitNameStatus(nulJoined("A", "src/new.ts", "M", "src/app.ts"))).toEqual([
    change("src/app.ts", "edited"),
    change("src/new.ts", "created"),
  ]);
});

test("a name-status rename carries a similarity score and three fields", () => {
  expect(parseGitNameStatus(nulJoined("R100", "src/old.ts", "src/new.ts"))).toEqual([
    change("src/new.ts", "created"),
    change("src/old.ts", "deleted"),
  ]);
});

test("work the agent committed is reported even though the tree is clean again", () => {
  const committed = [change("src/app.ts", "created")];

  expect(mergeGitChanges([], [], committed)).toEqual(committed);
});

test("a file that was already dirty before the run is not claimed as the run's doing", () => {
  const dirty = [change("src/app.ts", "edited")];

  expect(mergeGitChanges(dirty, dirty, [])).toEqual([]);
});

test("a file dirty before the run and deleted during it is still reported as deleted", () => {
  expect(
    mergeGitChanges([change("src/app.ts", "edited")], [change("src/app.ts", "deleted")], []),
  ).toEqual([change("src/app.ts", "deleted")]);
});

test("a file created in a commit and edited afterwards is created, not edited", () => {
  expect(
    mergeGitChanges([], [change("src/app.ts", "edited")], [change("src/app.ts", "created")]),
  ).toEqual([change("src/app.ts", "created")]);
});

test("ADHD's own run bookkeeping is never reported as something the run built", () => {
  expect(
    reportableChanges([change(".adhd/runs/abc/changes.json", "created"), change("a.ts", "created")]),
  ).toEqual([change("a.ts", "created")]);
});

test("a dependency directory is excluded at any depth, not only at the root", () => {
  expect(reportableChanges([change("packages/ui/node_modules/left.js", "created")])).toEqual([]);
});

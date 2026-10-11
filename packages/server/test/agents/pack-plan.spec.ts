// What a pack install may do to each file is decided by who installed it, whether
// the owner changed it since, and whether the pack still ships it. Every branch is a
// promise to the owner about their files, so each one is pinned here.
import { expect, test } from "vitest";
import { planPackInstall } from "../../src/domain/rules/pack-plan.ts";
import type { PackInstallInput, PackRecord } from "../../src/domain/rules/pack-plan.ts";

const STEP = "steps/draft-post.md";

test("a file the project does not have is written", () => {
  const plan = planPackInstall(input({ incoming: [{ path: STEP, sha256: "new" }] }));

  expect(plan.writes).toEqual([STEP]);
});

test("a file already identical on disk is kept as it is", () => {
  const plan = planPackInstall(
    input({ incoming: [{ path: STEP, sha256: "same" }], onDisk: new Map([[STEP, "same"]]) }),
  );

  expect(plan).toMatchObject({ writes: [], kept: [STEP], conflicts: [] });
});

test("a different file no pack installed is a conflict, because the owner wrote it", () => {
  const plan = planPackInstall(
    input({ incoming: [{ path: STEP, sha256: "pack" }], onDisk: new Map([[STEP, "owner"]]) }),
  );

  expect(plan.conflicts.map((issue) => issue.message)).toEqual([expect.stringContaining("no pack")]);
});

test("a file this pack installed and nobody edited is overwritten", () => {
  const plan = planPackInstall(
    input({
      incoming: [{ path: STEP, sha256: "v2" }],
      records: [record({ files: [{ path: STEP, sha256: "v1" }] })],
      onDisk: new Map([[STEP, "v1"]]),
    }),
  );

  expect(plan.writes).toEqual([STEP]);
});

test("a file this pack installed and the owner edited is a conflict", () => {
  const plan = planPackInstall(
    input({
      incoming: [{ path: STEP, sha256: "v2" }],
      records: [record({ files: [{ path: STEP, sha256: "v1" }] })],
      onDisk: new Map([[STEP, "edited"]]),
    }),
  );

  expect(plan.conflicts.map((issue) => issue.message)).toEqual([expect.stringContaining("edited")]);
});

test("a file another pack installed is a conflict, so one pack never overwrites another", () => {
  const plan = planPackInstall(
    input({
      incoming: [{ path: STEP, sha256: "mine" }],
      records: [record({ source: "C:/other-pack", files: [{ path: STEP, sha256: "theirs" }] })],
      onDisk: new Map([[STEP, "theirs"]]),
    }),
  );

  expect(plan.conflicts.map((issue) => issue.message)).toEqual([
    expect.stringContaining("C:/other-pack"),
  ]);
});

test("a file the pack stopped shipping is removed when nobody edited it", () => {
  const plan = planPackInstall(
    input({
      records: [record({ files: [{ path: STEP, sha256: "v1" }] })],
      onDisk: new Map([[STEP, "v1"]]),
    }),
  );

  expect(plan.removals).toEqual([STEP]);
});

test("a file the pack stopped shipping is kept when the owner edited it, since it is theirs now", () => {
  const plan = planPackInstall(
    input({
      records: [record({ files: [{ path: STEP, sha256: "v1" }] })],
      onDisk: new Map([[STEP, "edited"]]),
    }),
  );

  expect(plan).toMatchObject({ removals: [], kept: [STEP], conflicts: [] });
});

test("a file the pack stopped shipping and the owner already deleted needs nothing", () => {
  const plan = planPackInstall(
    input({ records: [record({ files: [{ path: STEP, sha256: "v1" }] })] }),
  );

  expect(plan).toEqual({ writes: [], removals: [], kept: [], conflicts: [] });
});

function input(overrides: Partial<PackInstallInput>): PackInstallInput {
  return {
    identity: overrides.identity ?? { source: "C:/seo-pack" },
    incoming: overrides.incoming ?? [],
    records: overrides.records ?? [],
    onDisk: overrides.onDisk ?? new Map(),
  };
}

function record(overrides: Partial<PackRecord>): PackRecord {
  return {
    source: overrides.source ?? "C:/seo-pack",
    path: overrides.path,
    installedAt: overrides.installedAt ?? "2026-10-11T10:00:00.000Z",
    files: overrides.files ?? [],
  };
}

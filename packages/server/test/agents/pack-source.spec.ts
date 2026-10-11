// A pack source is typed by the owner and handed to git or the file system, so what
// it may look like is decided before anything runs.
import os from "node:os";
import { expect, test } from "vitest";
import { packSourceOf } from "../../src/domain/rules/pack-source.ts";

test("an https repository is cloned, with its ref and the folder inside it", () => {
  const parsed = packSourceOf({
    source: "https://github.com/smekai/isotopy.git",
    ref: "main",
    path: "docs\\dogfood/agent-pack/",
  });

  expect(parsed).toEqual({
    ok: true,
    value: {
      kind: "git",
      url: "https://github.com/smekai/isotopy.git",
      ref: "main",
      subpath: "docs/dogfood/agent-pack",
    },
  });
});

test.each([
  ["an ssh repository", "ssh://git@github.com/smekai/isotopy.git"],
  ["the git@host:path shorthand", "git@github.com:refined/sharetravel.git"],
])("%s is cloned", (_form, source) => {
  expect(packSourceOf({ source })).toMatchObject({ value: { kind: "git" } });
});

test("an absolute folder is installed from in place", () => {
  const parsed = packSourceOf({ source: os.tmpdir() });

  expect(parsed).toEqual({ ok: true, value: { kind: "folder", folder: os.tmpdir() } });
});

test.each([
  ["plain http, which nothing should clone", { source: "http://example.test/pack.git" }],
  ["credentials in the URL", { source: "https://user:token@github.com/smekai/isotopy.git" }],
  ["a source git would read as an option", { source: "--upload-pack=touch /tmp/x" }],
  ["a relative folder, which depends on where the server started", { source: "packs/seo" }],
  ["a ref on a folder, which has no history to check out", { source: os.tmpdir(), ref: "main" }],
  ["a ref git would read as an option", { source: "https://github.com/a/b.git", ref: "--force" }],
  ["a path that climbs out of the repository", { source: "https://github.com/a/b.git", path: "../x" }],
])("%s is refused", (_reason, request) => {
  expect(packSourceOf(request)).toMatchObject({ ok: false });
});

// A pack can live in a git repository, at a ref and in a folder inside it, so any
// project's own `.isotopy/` is already one. These run real git against a local bare
// repository; git's own `url.<base>.insteadOf` stands it in for an https address,
// which is the only kind of remote the install would accept.
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, expect, inject, test } from "vitest";
import type { PackInstallResult } from "@isotopy/core";
import { agentFile, seoPack, writePack } from "../support/agent-files.ts";
import {
  cloneBare,
  commitEverything,
  headCommit,
  initGitRepository,
  tagHead,
} from "../support/git-project.ts";
import { createTestApp, post } from "../support/harness.ts";
import type { TestApp } from "../support/harness.ts";

const REMOTE = "https://example.test/pack.git";

const MISSING_REMOTE = "https://example.test/missing.git";

const GIT_CONFIG_KEYS = [
  "GIT_CONFIG_COUNT",
  "GIT_CONFIG_KEY_0",
  "GIT_CONFIG_VALUE_0",
  "GIT_CONFIG_KEY_1",
  "GIT_CONFIG_VALUE_1",
] as const;

let ctx: TestApp;
let work: string;
let firstCommit: string;

beforeEach(async () => {
  ctx = await createTestApp();
  const scratch = await mkdtemp(path.join(inject("testTempRoot"), "pack-git-"));
  work = path.join(scratch, "work");
  await writePack(path.join(work, "packs", "seo"), seoPack());
  await writePack(work, { "agents/decoy/agent.md": agentFile({ id: "decoy", title: "Decoy" }) });
  await initGitRepository(work);
  await commitEverything(work, "first");
  await tagHead(work, "v1");
  firstCommit = await headCommit(work);
  await writePack(path.join(work, "packs", "seo"), {
    "agents/seo-writer/agent.md": agentFile({ id: "seo-writer", title: "SEO Writer, second" }),
  });
  await commitEverything(work, "second");
  const bare = path.join(scratch, "pack.git");
  await cloneBare(work, bare);
  routeRemote(REMOTE, bare, 0);
  routeRemote(MISSING_REMOTE, path.join(scratch, "nowhere.git"), 1);
  process.env.GIT_CONFIG_COUNT = "2";
});

afterEach(async () => {
  for (const key of GIT_CONFIG_KEYS) {
    delete process.env[key];
  }
  await ctx.dispose();
});

test("a pack is cloned at the ref it names, and the commit it came from is recorded", async () => {
  // Act
  const { status, body } = await post<PackInstallResult>(ctx.app, "/agents/packs", {
    source: REMOTE,
    ref: "v1",
    path: "packs/seo",
  });

  // Assert
  expect(status).toBe(200);
  expect(body.commit).toBe(firstCommit);
  expect(await installed("agents/seo-writer/agent.md")).toContain("title: \"SEO Writer\"");
});

test("the path picks the folder inside the repository, so nothing outside it is installed", async () => {
  // Act
  await post(ctx.app, "/agents/packs", { source: REMOTE, path: "packs/seo" });

  // Assert
  expect(await installed("agents/decoy/agent.md")).toBeUndefined();
  expect(await installed("agents/seo-writer/agent.md")).toBeDefined();
});

test("a clone that fails is refused with git's reason, and leaves no temporary folder behind", async () => {
  // Arrange
  const before = await clonesInTemp();

  // Act
  const { status, body } = await post<{ issues: { message: string }[] }>(
    ctx.app,
    "/agents/packs",
    { source: MISSING_REMOTE },
  );

  // Assert
  expect(status).toBe(400);
  expect(body.issues[0]?.message).toContain("git clone");
  expect(await clonesInTemp()).toEqual(before);
});

function routeRemote(remote: string, local: string, index: number): void {
  process.env[`GIT_CONFIG_KEY_${index}`] = `url.${pathToFileURL(local).href}.insteadOf`;
  process.env[`GIT_CONFIG_VALUE_${index}`] = remote;
}

function installed(relative: string): Promise<string | undefined> {
  return readFile(path.join(ctx.home, ...relative.split("/")), "utf8").catch(() => undefined);
}

async function clonesInTemp(): Promise<string[]> {
  const entries = await readdir(os.tmpdir());
  return entries.filter((entry) => entry.startsWith("isotopy-pack-")).sort();
}

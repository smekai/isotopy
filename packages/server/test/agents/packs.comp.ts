// A pack is a folder of agents and steps that another project can install. These
// pin what an install may and may not do to a project: write what the pack ships and
// record it, never touch what the project learned, refuse rather than overwrite a file
// the owner changed, and leave the project exactly as it was when it refuses.
import { mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, expect, inject, test } from "vitest";
import type { AgentCatalogEntry, PackInstallResult, ScheduleView } from "@isotopy/core";
import { REPO_ROOT } from "../../src/paths.ts";
import { seoPack, stepFile, writePack, writeText } from "../support/agent-files.ts";
import { createTestApp, get, post } from "../support/harness.ts";
import type { TestApp } from "../support/harness.ts";

const NEXT_STEP = stepFile({ id: "draft-post", body: "# Assignment: Draft a post, version two" });

let ctx: TestApp;
let pack: string;

beforeEach(async () => {
  ctx = await createTestApp();
  pack = await mkdtemp(path.join(inject("testTempRoot"), "pack-"));
});

afterEach(async () => {
  await ctx.dispose();
});

test("installing a pack from a folder writes what it ships and records each file it wrote", async () => {
  // Arrange
  await writePack(pack, seoPack());

  // Act
  const { status, body } = await post<PackInstallResult>(ctx.app, "/agents/packs", { source: pack });

  // Assert
  expect(status).toBe(200);
  expect([...body.written].sort()).toEqual(Object.keys(seoPack()).sort());
  expect(await installed("agents/seo-writer/agent.md")).toBe(seoPack()["agents/seo-writer/agent.md"]);
  expect(await recordedFiles()).toEqual(Object.keys(seoPack()).sort());
});

test("an install never copies a pack's skills/ or touches what the project learned", async () => {
  // Arrange
  await writePack(pack, { ...seoPack(), "skills/seo-writer.notes.md": "- the pack's notes\n" });
  await writeText(path.join(ctx.home, "skills", "seo-writer.notes.md"), "- the project's own\n");

  // Act
  await post(ctx.app, "/agents/packs", { source: pack });

  // Assert
  expect(await installed("skills/seo-writer.notes.md")).toBe("- the project's own\n");
});

test("an agent installed from a pack shows in the catalog as having come from a pack", async () => {
  // Arrange
  await writePack(pack, seoPack());
  await post(ctx.app, "/agents/packs", { source: pack });

  // Act
  const { body } = await get<AgentCatalogEntry[]>(ctx.app, "/agents");

  // Assert
  expect(body.find((entry) => entry.id === "seo-writer")?.origin).toBe("pack");
});

test("a re-install over a file the owner edited is refused, and nothing is written", async () => {
  // Arrange
  await writePack(pack, seoPack());
  await post(ctx.app, "/agents/packs", { source: pack });
  await writeText(path.join(ctx.home, "agents", "seo-writer", "agent.md"), "edited by the owner");
  await writePack(pack, { "steps/draft-post.md": NEXT_STEP });

  // Act
  const { status, body } = await post<{ issues: { message: string }[] }>(
    ctx.app,
    "/agents/packs",
    { source: pack },
  );

  // Assert
  expect(status).toBe(409);
  expect(body.issues.map((issue) => issue.message)).toEqual([
    expect.stringContaining("agents/seo-writer/agent.md"),
  ]);
  expect(await installed("steps/draft-post.md")).toBe(seoPack()["steps/draft-post.md"]);
});

test("a file the project already has, that no pack installed, is a conflict rather than overwritten", async () => {
  // Arrange
  await writePack(pack, seoPack());
  await writeText(path.join(ctx.home, "steps", "draft-post.md"), "the owner's own step");

  // Act
  const { status } = await post(ctx.app, "/agents/packs", { source: pack });

  // Assert
  expect(status).toBe(409);
  expect(await installed("steps/draft-post.md")).toBe("the owner's own step");
});

test("a re-install overwrites a file it installed and the owner left alone", async () => {
  // Arrange
  await writePack(pack, seoPack());
  await post(ctx.app, "/agents/packs", { source: pack });
  await writePack(pack, { "steps/draft-post.md": NEXT_STEP });

  // Act
  const { body } = await post<PackInstallResult>(ctx.app, "/agents/packs", { source: pack });

  // Assert
  expect(body.written).toEqual(["steps/draft-post.md"]);
  expect(await installed("steps/draft-post.md")).toBe(NEXT_STEP);
});

test("a re-install removes a file the pack stopped shipping", async () => {
  // Arrange
  await writePack(pack, seoPack());
  await post(ctx.app, "/agents/packs", { source: pack });
  await rm(path.join(pack, "agents", "seo-writer", "knowledge", "keyword-brief.md"));

  // Act
  const { body } = await post<PackInstallResult>(ctx.app, "/agents/packs", { source: pack });

  // Assert
  expect(body.removed).toEqual(["agents/seo-writer/knowledge/keyword-brief.md"]);
  expect(await installed("agents/seo-writer/knowledge/keyword-brief.md")).toBeUndefined();
});

test("one invalid file refuses the whole install, and nothing is written", async () => {
  // Arrange
  await writePack(pack, { ...seoPack(), "steps/broken.md": "# Assignment: no front matter" });

  // Act
  const { status, body } = await post<{ issues: { message: string }[] }>(
    ctx.app,
    "/agents/packs",
    { source: pack },
  );

  // Assert
  expect(status).toBe(400);
  expect(body.issues.map((issue) => issue.message)).toEqual([
    expect.stringContaining("steps/broken.md"),
  ]);
  expect(await installed("agents/seo-writer/agent.md")).toBeUndefined();
});

test("a link inside a pack is refused, so a pack cannot reach files outside itself", async () => {
  // Arrange
  await writePack(pack, seoPack());
  const elsewhere = await mkdtemp(path.join(inject("testTempRoot"), "elsewhere-"));
  await symlink(elsewhere, path.join(pack, "agents", "linked"), "junction");

  // Act
  const { status } = await post(ctx.app, "/agents/packs", { source: pack });

  // Assert
  expect(status).toBe(400);
  expect(await installed("agents/seo-writer/agent.md")).toBeUndefined();
});

test("a file with CRLF line endings installs byte for byte", async () => {
  // Arrange
  const crlf = seoPack()["agents/seo-writer/agent.md"]?.replace(/\n/g, "\r\n") ?? "";
  await writePack(pack, { ...seoPack(), "agents/seo-writer/agent.md": crlf });

  // Act
  await post(ctx.app, "/agents/packs", { source: pack });

  // Assert
  expect(await installed("agents/seo-writer/agent.md")).toBe(crlf);
});

test("a duty a pack brings is seeded as a schedule, switched off", async () => {
  // Arrange
  await writePack(pack, seoPack());

  // Act
  await post(ctx.app, "/agents/packs", { source: pack });

  // Assert
  const { body } = await get<ScheduleView[]>(ctx.app, "/schedules");
  expect(body.find((schedule) => schedule.builtIn === "seo-writer/monthly-audit")?.enabled).toBe(
    false,
  );
});

test("a second install into the same project while one is running is refused", async () => {
  // Arrange
  await writePack(pack, seoPack());

  // Act
  const [first, second] = await Promise.all([
    post(ctx.app, "/agents/packs", { source: pack }),
    post(ctx.app, "/agents/packs", { source: pack }),
  ]);

  // Assert
  expect([first.status, second.status].sort()).toEqual([200, 409]);
});

test("the example pack the docs point at installs cleanly", async () => {
  // Act
  const { status, body } = await post<PackInstallResult>(ctx.app, "/agents/packs", {
    source: path.join(REPO_ROOT, "docs", "dogfood", "agent-pack"),
  });

  // Assert
  expect(status).toBe(200);
  expect(body.written).toContain("agents/seo-writer/agent.md");
});

test("a folder that does not exist is refused with its path", async () => {
  // Act
  const { status, body } = await post<{ issues: { message: string }[] }>(
    ctx.app,
    "/agents/packs",
    { source: path.join(pack, "missing") },
  );

  // Assert
  expect(status).toBe(400);
  expect(body.issues[0]?.message).toContain("missing");
});

function installed(relative: string): Promise<string | undefined> {
  return readFile(path.join(ctx.home, ...relative.split("/")), "utf8").catch(() => undefined);
}

async function recordedFiles(): Promise<string[]> {
  const record = JSON.parse(await readFile(path.join(ctx.home, "packs.json"), "utf8")) as {
    packs: { files: { path: string }[] }[];
  };
  return record.packs.flatMap((entry) => entry.files.map((file) => file.path)).sort();
}


import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import type { DirectoryListing } from "../src/utils/directory-browser.ts";
import { createTestApp, get } from "./support/harness.ts";
import type { TestApp } from "./support/harness.ts";

let ctx: TestApp;

beforeEach(async () => {
  ctx = await createTestApp();
});

afterEach(async () => {
  await ctx.dispose();
});

test("a pasted folder path lists that folder's sub-folders under its resolved path", async () => {
  // Arrange
  await mkdir(path.join(ctx.home, "app"), { recursive: true });

  // Act
  const { status, body } = await get<DirectoryListing>(ctx.app, dirsOf(ctx.home));

  // Assert
  expect(status).toBe(200);
  expect(body.path).toBe(path.resolve(ctx.home));
  expect(body.entries).toContain("app");
});

test("a path pasted inside quotes, as Windows' Copy as path gives it, is the same folder", async () => {
  // Act
  const { status, body } = await get<DirectoryListing>(ctx.app, dirsOf(`"${ctx.home}"`));

  // Assert
  expect(status).toBe(200);
  expect(body.path).toBe(path.resolve(ctx.home));
});

test("a path starting with ~ is under the user's home folder", async () => {
  // Act
  const { status, body } = await get<DirectoryListing>(ctx.app, dirsOf("~"));

  // Assert
  expect(status).toBe(200);
  expect(body.path).toBe(path.resolve(os.homedir()));
});

test("a folder that does not exist is refused, naming the path it resolved to", async () => {
  // Arrange
  const missing = path.join(ctx.home, "not-here");

  // Act
  const { status, body } = await get<{ error: string }>(ctx.app, dirsOf(missing));

  // Assert
  expect(status).toBe(400);
  expect(body.error).toContain(missing);
});

test("a file is refused rather than listed as an empty folder", async () => {
  // Arrange
  const file = path.join(ctx.home, "notes.txt");
  await writeFile(file, "not a folder", "utf8");

  // Act
  const { status, body } = await get<{ error: string }>(ctx.app, dirsOf(file));

  // Assert
  expect(status).toBe(400);
  expect(body.error).toContain(file);
});

function dirsOf(typed: string): string {
  return `/fs/dirs?path=${encodeURIComponent(typed)}`;
}

import { createHash } from "node:crypto";
import path from "node:path";

const ID_HASH_LENGTH = 8;
const MAX_SLUG_LENGTH = 24;

function foldCaseWhereFilesystemIsInsensitive(target: string): string {
  return process.platform === "win32" ? target.toLowerCase() : target;
}

function toForwardSlashes(target: string): string {
  return target.replace(/[\\/]+/g, "/");
}

function stripTrailingSlash(target: string): string {
  return target.length > 1 ? target.replace(/\/$/, "") : target;
}

export function normalizeProjectRoot(root: string): string {
  return foldCaseWhereFilesystemIsInsensitive(
    stripTrailingSlash(toForwardSlashes(path.resolve(root.trim()))),
  );
}

export function sameProjectRoot(left: string, right: string): boolean {
  return normalizeProjectRoot(left) === normalizeProjectRoot(right);
}

export function projectNameFor(root: string): string {
  const resolved = path.resolve(root.trim());
  const base = path.basename(resolved);
  return base === "" ? resolved : base;
}

function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_LENGTH);
  return slug === "" ? "project" : slug;
}

function hashOfNormalizedRoot(root: string): string {
  return createHash("sha1")
    .update(normalizeProjectRoot(root))
    .digest("hex")
    .slice(0, ID_HASH_LENGTH);
}

export function projectIdFor(root: string): string {
  return `${slugify(projectNameFor(root))}-${hashOfNormalizedRoot(root)}`;
}

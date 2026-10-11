import path from "node:path";
import type { InstallPackRequest } from "@isotopy/core";
import type { ValidationIssue, ValidationResult } from "../validation.ts";

export type PackSource =
  | { kind: "folder"; folder: string }
  | { kind: "git"; url: string; ref?: string; subpath?: string };

const CREDENTIALS = /^[a-z][a-z0-9+.-]*:\/\/[^/]*@/i;

const ANY_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;

const HTTPS_URL = /^https:\/\/([^/\s]+)\/\S+$/;

const SSH_URL = /^ssh:\/\/(?:[^/@\s]+@)?([^/\s]+)\/\S+$/;

const SCP_LIKE = /^[A-Za-z0-9._-]+@([A-Za-z0-9.-]+):(?!\/\/)\S+$/;

export function packSourceOf(request: InstallPackRequest): ValidationResult<PackSource> {
  const { source, ref, path: subpath } = request;
  if (source.startsWith("-")) {
    return refused(["source"], "A source cannot start with -");
  }
  if (source.startsWith("https://") && CREDENTIALS.test(source)) {
    return refused(["source"], "A source URL cannot carry credentials");
  }
  const host = gitHostOf(source);
  if (host !== undefined) {
    return gitSource(source, host, ref, subpath);
  }
  if (ANY_SCHEME.test(source)) {
    return refused(["source"], "Only https://, ssh:// and git@host:path sources can be cloned");
  }
  if (!path.isAbsolute(source)) {
    return refused(["source"], "A folder source must be an absolute path");
  }
  if (ref !== undefined || subpath !== undefined) {
    return refused(
      [ref !== undefined ? "ref" : "path"],
      "A ref or a path inside a repository only applies to a git source; name the folder itself",
    );
  }
  return { ok: true, value: { kind: "folder", folder: source } };
}

function gitHostOf(source: string): string | undefined {
  return HTTPS_URL.exec(source)?.[1] ?? SSH_URL.exec(source)?.[1] ?? SCP_LIKE.exec(source)?.[1];
}

function gitSource(
  url: string,
  host: string,
  ref: string | undefined,
  subpath: string | undefined,
): ValidationResult<PackSource> {
  if (host.startsWith("-")) {
    return refused(["source"], "A source host cannot start with -");
  }
  if (ref?.startsWith("-")) {
    return refused(["ref"], "A ref cannot start with -");
  }
  const inside = subpath === undefined ? undefined : insidePath(subpath);
  if (inside !== undefined && !inside.ok) {
    return inside;
  }
  return { ok: true, value: { kind: "git", url, ref, subpath: inside?.value } };
}

function insidePath(subpath: string): ValidationResult<string> {
  const segments = subpath.split(/[\\/]+/).filter((segment) => segment !== "" && segment !== ".");
  if (path.isAbsolute(subpath) || /^[A-Za-z]:/.test(subpath) || segments.includes("..")) {
    return refused(["path"], "The path must stay inside the repository");
  }
  return { ok: true, value: segments.join("/") };
}

function refused(issuePath: ValidationIssue["path"], message: string): ValidationResult<never> {
  return { ok: false, issues: [{ path: issuePath, message }] };
}

// Read-only view of a run's workspace, so the UI can show what a run actually
// produced rather than only what the agent said it did.
//
// Every path from a client is untrusted: `resolveInsideWorkspace` is the single
// gate that keeps reads within the run's own directory.
import { readFile, readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";

/** Directories that are never worth listing and can be enormous. */
const IGNORED_DIRECTORIES = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".turbo",
  ".venv",
  "__pycache__",
]);

/** Guards against walking a pathologically deep or wide tree. */
const MAX_DEPTH = 8;
const MAX_ENTRIES = 500;

/** Files above this are listed but not previewed. */
export const MAX_PREVIEW_BYTES = 256 * 1024;

export interface WorkspaceFile {
  /** POSIX-style path relative to the workspace root — safe to show and to send back. */
  path: string;
  size: number;
}

export interface WorkspaceFileContent {
  path: string;
  size: number;
  content: string;
  /** True when the file was too large to preview and `content` is empty. */
  truncated: boolean;
}

/** Windows and POSIX separators both become `/` so the UI has one shape. */
function toPosix(relativePath: string): string {
  return relativePath.split(path.sep).join("/");
}

/**
 * Resolve a client-supplied relative path against the workspace, refusing
 * anything that escapes it — `..`, an absolute path, or a symlink pointing
 * outside. Returns the absolute path to read.
 */
export async function resolveInsideWorkspace(
  workspacePath: string,
  relativePath: string,
): Promise<string> {
  if (path.isAbsolute(relativePath)) {
    throw new Error("Path must be relative to the workspace");
  }
  const root = await realpath(workspacePath);
  const target = path.resolve(root, relativePath);

  // Check the lexical path first: a non-existent traversal target must still be
  // rejected as traversal rather than as "not found".
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new Error("Path escapes the workspace");
  }

  // Then resolve symlinks — a link inside the workspace may still point out.
  const real = await realpath(target);
  if (real !== root && !real.startsWith(root + path.sep)) {
    throw new Error("Path escapes the workspace");
  }
  return real;
}

/**
 * Walk the workspace breadth-first, skipping noisy directories and stopping at
 * the depth/entry caps so a large repo cannot stall the request.
 */
export async function listWorkspaceFiles(workspacePath: string): Promise<WorkspaceFile[]> {
  const root = await realpath(workspacePath);
  const files: WorkspaceFile[] = [];

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > MAX_DEPTH || files.length >= MAX_ENTRIES) {
      return;
    }
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return; // unreadable directory — skip rather than fail the whole listing
    }
    for (const entry of entries) {
      if (files.length >= MAX_ENTRIES) {
        return;
      }
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORIES.has(entry.name)) {
          await walk(absolute, depth + 1);
        }
      } else if (entry.isFile()) {
        try {
          const { size } = await stat(absolute);
          files.push({ path: toPosix(path.relative(root, absolute)), size });
        } catch {
          // vanished between readdir and stat — ignore
        }
      }
    }
  }

  await walk(root, 0);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

/** Read one workspace file for preview. Oversized files report `truncated`. */
export async function readWorkspaceFile(
  workspacePath: string,
  relativePath: string,
): Promise<WorkspaceFileContent> {
  const absolute = await resolveInsideWorkspace(workspacePath, relativePath);
  const { size, isFile } = await stat(absolute).then((s) => ({
    size: s.size,
    isFile: s.isFile(),
  }));
  if (!isFile) {
    throw new Error("Not a file");
  }
  if (size > MAX_PREVIEW_BYTES) {
    return { path: toPosix(relativePath), size, content: "", truncated: true };
  }
  return {
    path: toPosix(relativePath),
    size,
    content: await readFile(absolute, "utf8"),
    truncated: false,
  };
}

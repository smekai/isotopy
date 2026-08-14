import { readFile, readdir, realpath, stat } from "node:fs/promises";
import type { Stats } from "node:fs";
import path from "node:path";

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

const MAX_DEPTH = 8;
const MAX_ENTRIES = 500;

export const SNAPSHOT_IGNORED_DIRECTORIES = new Set([...IGNORED_DIRECTORIES, ".isotopy"]);
const SNAPSHOT_MAX_DEPTH = 12;
const SNAPSHOT_MAX_ENTRIES = 20_000;

export const MAX_PREVIEW_BYTES = 256 * 1024;

export interface WorkspaceFile {
  path: string;
  size: number;
}

export interface FileStamp {
  mtimeMs: number;
  size: number;
}

export interface WorkspaceSnapshot {
  files: Map<string, FileStamp>;
  truncated: boolean;
}

export interface WorkspaceFileContent {
  path: string;
  size: number;
  content: string;
  truncated: boolean;
}

function toPosix(relativePath: string): string {
  return relativePath.split(path.sep).join("/");
}

export async function resolveInsideWorkspace(
  workspacePath: string,
  relativePath: string,
): Promise<string> {
  if (path.isAbsolute(relativePath)) {
    throw new Error("Path must be relative to the workspace");
  }
  const root = await realpath(workspacePath);
  const target = path.resolve(root, relativePath);

  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new Error("Path escapes the workspace");
  }

  const real = await realpath(target);
  if (real !== root && !real.startsWith(root + path.sep)) {
    throw new Error("Path escapes the workspace");
  }
  return real;
}

interface WalkLimits {
  maxDepth: number;
  maxEntries: number;
  ignored: Set<string>;
}

const LIST_LIMITS: WalkLimits = {
  maxDepth: MAX_DEPTH,
  maxEntries: MAX_ENTRIES,
  ignored: IGNORED_DIRECTORIES,
};

const SNAPSHOT_LIMITS: WalkLimits = {
  maxDepth: SNAPSHOT_MAX_DEPTH,
  maxEntries: SNAPSHOT_MAX_ENTRIES,
  ignored: SNAPSHOT_IGNORED_DIRECTORIES,
};

async function walkWorkspace(
  root: string,
  limits: WalkLimits,
  visit: (relativePath: string, stats: Stats) => void,
): Promise<boolean> {
  let visited = 0;
  let truncated = false;

  async function walk(dir: string, depth: number): Promise<void> {
    if (visited >= limits.maxEntries || depth > limits.maxDepth) {
      truncated = true;
      return;
    }
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (visited >= limits.maxEntries) {
        truncated = true;
        return;
      }
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!limits.ignored.has(entry.name)) {
          await walk(absolute, depth + 1);
        }
      } else if (entry.isFile()) {
        try {
          visit(toPosix(path.relative(root, absolute)), await stat(absolute));
          visited += 1;
        } catch {}
      }
    }
  }

  await walk(root, 0);
  return truncated;
}

export async function listWorkspaceFiles(workspacePath: string): Promise<WorkspaceFile[]> {
  const root = await realpath(workspacePath);
  const files: WorkspaceFile[] = [];
  await walkWorkspace(root, LIST_LIMITS, (relativePath, stats) => {
    files.push({ path: relativePath, size: stats.size });
  });
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

export async function snapshotWorkspace(workspacePath: string): Promise<WorkspaceSnapshot> {
  const root = await realpath(workspacePath);
  const files = new Map<string, FileStamp>();
  const truncated = await walkWorkspace(root, SNAPSHOT_LIMITS, (relativePath, stats) => {
    files.set(relativePath, { mtimeMs: stats.mtimeMs, size: stats.size });
  });
  return { files, truncated };
}

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

import { readFile, readdir, realpath, stat } from "node:fs/promises";
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

export const MAX_PREVIEW_BYTES = 256 * 1024;

export interface WorkspaceFile {
  path: string;
  size: number;
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
      return;
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
        } catch {}
      }
    }
  }

  await walk(root, 0);
  return files.sort((a, b) => a.path.localeCompare(b.path));
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

import { readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export interface DirectoryListing {
  path: string;
  parent: string | null;
  entries: string[];
  isRootList: boolean;
}

async function listRoots(): Promise<DirectoryListing> {
  const roots = [os.homedir()];
  if (process.platform === "win32") {
    const letters = Array.from({ length: 26 }, (_, i) => `${String.fromCharCode(65 + i)}:\\`);
    const present = await Promise.all(
      letters.map(async (drive) => {
        try {
          await readdir(drive);
          return drive;
        } catch {
          return undefined;
        }
      }),
    );
    roots.push(...present.filter((drive): drive is string => drive !== undefined));
  } else {
    roots.push(path.sep);
  }
  return { path: "", parent: null, entries: roots, isRootList: true };
}

function isFilesystemRoot(dir: string): boolean {
  return path.dirname(dir) === dir;
}

export async function listDirectories(targetPath?: string): Promise<DirectoryListing> {
  if (!targetPath || targetPath.trim() === "") {
    return listRoots();
  }

  const resolved = path.resolve(targetPath.trim());
  let entries;
  try {
    entries = await readdir(resolved, { withFileTypes: true });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    const reason =
      code === "ENOENT"
        ? `Directory does not exist: ${resolved}`
        : code === "EACCES" || code === "EPERM"
          ? `Permission denied: ${resolved}`
          : code === "ENOTDIR"
            ? `Not a directory: ${resolved}`
            : `Cannot read directory: ${resolved}`;
    throw new Error(reason, { cause: error });
  }

  return {
    path: resolved,
    parent: isFilesystemRoot(resolved) ? null : path.dirname(resolved),
    entries: entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b)),
    isRootList: false,
  };
}

export function joinDirectory(base: string, entry: string): string {
  return base === "" ? entry : path.join(base, entry);
}

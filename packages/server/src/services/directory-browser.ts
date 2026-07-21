// Backs the folder picker: lets the user choose where a project lives without
// typing an absolute path from memory.
//
// Deliberately narrow — it returns directory *names* only, never file contents
// and never file names, so it cannot be used to read anything off the machine.
// The server binds to localhost, and this stays read-only.
import { readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export interface DirectoryListing {
  /** Absolute path that was listed; empty when listing the roots. */
  path: string;
  /** Parent directory, or null at a filesystem root. */
  parent: string | null;
  /** Immediate subdirectory names (not full paths). */
  entries: string[];
  /** True when `entries` are top-level roots rather than children of `path`. */
  isRootList: boolean;
}

/**
 * Starting points when no path is given: the home directory, plus the drive
 * letters on Windows (macOS/Linux have a single `/` root instead).
 */
async function listRoots(): Promise<DirectoryListing> {
  const roots = [os.homedir()];
  if (process.platform === "win32") {
    // Probe A: to Z: — enumerating drives has no cross-platform API.
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

/** Whether `dir` is a filesystem root (`C:\` or `/`), which has no parent. */
function isFilesystemRoot(dir: string): boolean {
  return path.dirname(dir) === dir;
}

/**
 * List the subdirectories of `targetPath`, or the roots when it is omitted.
 * Throws with a readable message when the directory cannot be read, so the UI
 * can show why instead of failing silently.
 */
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

/** Join a listed entry onto its parent. Root entries are already absolute. */
export function joinDirectory(base: string, entry: string): string {
  return base === "" ? entry : path.join(base, entry);
}

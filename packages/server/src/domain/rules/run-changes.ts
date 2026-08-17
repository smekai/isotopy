import type { FileChange, FileChangeKind } from "@isotopy/core";
import type { DirtyFile } from "../../schemas/run-change-baseline.ts";
import { SNAPSHOT_IGNORED_DIRECTORIES } from "../../utils/workspace-files.ts";
import type { WorkspaceSnapshot } from "../../utils/workspace-files.ts";

type ChangeMap = Map<string, FileChangeKind>;

export function reportableChanges(changes: FileChange[]): FileChange[] {
  return changes.filter(
    (change) =>
      !change.path
        .split("/")
        .some((segment) => SNAPSHOT_IGNORED_DIRECTORIES.has(segment)),
  );
}

export function diffSnapshots(
  baseline: WorkspaceSnapshot,
  final: WorkspaceSnapshot,
): FileChange[] {
  const changes: ChangeMap = new Map();
  for (const [filePath, stamp] of final.files) {
    const before = baseline.files.get(filePath);
    if (before === undefined) {
      changes.set(filePath, "created");
    } else if (before.mtimeMs !== stamp.mtimeMs || before.size !== stamp.size) {
      changes.set(filePath, "edited");
    }
  }
  for (const filePath of baseline.files.keys()) {
    if (!final.files.has(filePath)) {
      changes.set(filePath, "deleted");
    }
  }
  return sortChanges(changes);
}

export function parseGitStatus(porcelain: string): FileChange[] {
  const fields = nulFields(porcelain);
  const changes: ChangeMap = new Map();
  for (let index = 0; index < fields.length; index += 1) {
    const entry = fields[index];
    if (entry === undefined || entry.length < 4) {
      continue;
    }
    const code = entry.slice(0, 2);
    const filePath = entry.slice(3);
    if (isRenameOrCopy(code)) {
      const original = fields[index + 1];
      index += 1;
      changes.set(filePath, "created");
      if (code.includes("R") && original !== undefined) {
        changes.set(original, "deleted");
      }
      continue;
    }
    const kind = kindForStatusCode(code);
    if (kind !== undefined) {
      changes.set(filePath, kind);
    }
  }
  return sortChanges(changes);
}

export function parseGitNameStatus(output: string): FileChange[] {
  const fields = nulFields(output);
  const changes: ChangeMap = new Map();
  for (let index = 0; index < fields.length; index += 1) {
    const code = fields[index];
    if (code === undefined || code === "") {
      continue;
    }
    if (isRenameOrCopy(code)) {
      const original = fields[index + 1];
      const renamed = fields[index + 2];
      index += 2;
      if (renamed !== undefined) {
        changes.set(renamed, "created");
      }
      if (code.startsWith("R") && original !== undefined) {
        changes.set(original, "deleted");
      }
      continue;
    }
    const filePath = fields[index + 1];
    index += 1;
    const kind = kindForStatusCode(code.slice(0, 1));
    if (kind !== undefined && filePath !== undefined) {
      changes.set(filePath, kind);
    }
  }
  return sortChanges(changes);
}

export function mergeGitChanges(
  baselineDirty: DirtyFile[],
  finalDirty: DirtyFile[],
  committed: FileChange[],
): FileChange[] {
  const preexisting = new Map(baselineDirty.map((change) => [change.path, change]));
  const changes: ChangeMap = new Map();
  const applicable = [
    ...committed,
    ...finalDirty.filter((change) => !isUntouchedDirt(preexisting.get(change.path), change)),
  ];
  for (const change of applicable) {
    const combined = combine(changes.get(change.path), change.kind);
    if (combined === undefined) {
      changes.delete(change.path);
    } else {
      changes.set(change.path, combined);
    }
  }
  return sortChanges(changes);
}

function isUntouchedDirt(baseline: DirtyFile | undefined, final: DirtyFile): boolean {
  if (baseline === undefined || baseline.kind !== final.kind) {
    return false;
  }
  return (
    baseline.blob === undefined || final.blob === undefined || baseline.blob === final.blob
  );
}

function combine(
  previous: FileChangeKind | undefined,
  next: FileChangeKind,
): FileChangeKind | undefined {
  if (previous === undefined) {
    return next;
  }
  if (previous === "created" && next === "edited") {
    return "created";
  }
  if (previous === "created" && next === "deleted") {
    return undefined;
  }
  if (previous === "deleted" && next === "created") {
    return "edited";
  }
  return next;
}

function isRenameOrCopy(code: string): boolean {
  return code.startsWith("R") || code.startsWith("C") || code[1] === "R" || code[1] === "C";
}

function kindForStatusCode(code: string): FileChangeKind | undefined {
  if (code === "??") {
    return "created";
  }
  const index = code[0] ?? " ";
  const worktree = code[1] ?? " ";
  if (index === "A" && worktree === "D") {
    return undefined;
  }
  if (index === "D" || worktree === "D") {
    return "deleted";
  }
  if (index === "A" || worktree === "A") {
    return "created";
  }
  if (index === " " && worktree === " ") {
    return undefined;
  }
  return "edited";
}

function nulFields(output: string): string[] {
  return output.split("\0").filter((field) => field !== "");
}

function sortChanges(changes: ChangeMap): FileChange[] {
  return [...changes]
    .map(([path, kind]) => ({ path, kind }))
    .sort((left, right) => left.path.localeCompare(right.path));
}

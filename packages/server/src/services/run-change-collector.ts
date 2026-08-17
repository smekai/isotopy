import { stat } from "node:fs/promises";
import path from "node:path";
import type { FileChange, RunChangeSet, RunState } from "@isotopy/core";
import {
  diffSnapshots,
  mergeGitChanges,
  parseGitNameStatus,
  parseGitStatus,
  reportableChanges,
} from "../domain/rules/run-changes.ts";
import { runSubprocess } from "../engines/subprocess.ts";
import type { SubprocessResult, SubprocessSpec } from "../engines/subprocess.ts";
import type { ProjectPath } from "../paths.ts";
import { RUN_CHANGE_BASELINE_VERSION } from "../schemas/run-change-baseline.ts";
import type { DirtyFile, RunChangeBaseline } from "../schemas/run-change-baseline.ts";
import { snapshotWorkspace } from "../utils/workspace-files.ts";
import type { WorkspaceSnapshot } from "../utils/workspace-files.ts";
import {
  persistRunChangeBaseline,
  persistRunChanges,
  readRunChangeBaseline,
} from "./run-evidence.ts";

const GIT_TIMEOUT_MS = 15_000;
const EMPTY_TREE_OBJECT = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
const STATUS_ARGS = ["status", "--porcelain=v1", "-z", "-uall"];
const HASH_OBJECT_ARGS = ["hash-object", "--stdin-paths"];

type BlobIndex = ReadonlyMap<string, string | undefined>;

type SubprocessRunner = (spec: SubprocessSpec) => Promise<SubprocessResult>;

export interface RunChangeCollectorDependencies {
  run: SubprocessRunner;
  now: () => Date;
}

function defaultDependencies(): RunChangeCollectorDependencies {
  return { run: runSubprocess, now: () => new Date() };
}

async function isRepositoryRoot(workspacePath: string): Promise<boolean> {
  try {
    await stat(path.join(workspacePath, ".git"));
    return true;
  } catch {
    return false;
  }
}

function stillDirtyAtBaseline(
  finalDirty: FileChange[],
  baselineDirty: DirtyFile[],
): FileChange[] {
  const baselinePaths = new Set(baselineDirty.map((change) => change.path));
  return finalDirty.filter((change) => baselinePaths.has(change.path));
}

function pathsWithContent(changes: FileChange[]): string[] {
  return changes.filter((change) => change.kind !== "deleted").map((change) => change.path);
}

function withBlobs(changes: FileChange[], blobs: BlobIndex): DirtyFile[] {
  return changes.map((change) => ({ ...change, blob: blobs.get(change.path) }));
}

function restoreSnapshot(baseline: RunChangeBaseline): WorkspaceSnapshot {
  return {
    files: new Map(
      baseline.snapshot.files.map(({ path, mtimeMs, size }) => [path, { mtimeMs, size }]),
    ),
    truncated: baseline.snapshot.truncated,
  };
}

export class RunChangeCollector {
  private readonly deps: RunChangeCollectorDependencies;

  constructor(deps: Partial<RunChangeCollectorDependencies> = {}) {
    this.deps = { ...defaultDependencies(), ...deps };
  }

  async recordBaseline(
    project: ProjectPath,
    runId: string,
    workspacePath: string | undefined,
  ): Promise<void> {
    if (workspacePath === undefined) {
      return;
    }
    try {
      await this.captureBaseline(project, runId, workspacePath);
    } catch (error) {
      console.warn(`Failed to record the file baseline for run ${runId}:`, error);
    }
  }

  async attach(project: ProjectPath, run: RunState): Promise<boolean> {
    if (run.workspacePath === undefined || run.changes !== undefined) {
      return false;
    }
    try {
      const changes = await this.capture(project, run.id, run.workspacePath);
      if (changes === undefined) {
        return false;
      }
      run.changes = changes;
      return true;
    } catch (error) {
      console.warn(`Failed to capture file changes for run ${run.id}:`, error);
      return false;
    }
  }

  async captureBaseline(
    project: ProjectPath,
    runId: string,
    workspacePath: string,
  ): Promise<void> {
    const snapshot = await snapshotWorkspace(workspacePath);
    const git = await this.gitBaseline(workspacePath);
    await persistRunChangeBaseline(project, runId, {
      version: RUN_CHANGE_BASELINE_VERSION,
      capturedAt: this.deps.now().toISOString(),
      snapshot: {
        files: [...snapshot.files].map(([path, stamp]) => ({ path, ...stamp })),
        truncated: snapshot.truncated,
      },
      git,
    });
  }

  async capture(
    project: ProjectPath,
    runId: string,
    workspacePath: string,
  ): Promise<RunChangeSet | undefined> {
    const baseline = await readRunChangeBaseline(project, runId);
    if (baseline === undefined) {
      return undefined;
    }
    const capturedAt = this.deps.now().toISOString();
    const changes =
      baseline.git === undefined
        ? undefined
        : await this.gitChanges(workspacePath, baseline.git);
    const changeSet =
      changes === undefined
        ? await this.snapshotChanges(workspacePath, baseline, capturedAt)
        : { source: "git" as const, files: changes, truncated: false, capturedAt };
    await persistRunChanges(project, runId, changeSet);
    return changeSet;
  }

  private async snapshotChanges(
    workspacePath: string,
    baseline: RunChangeBaseline,
    capturedAt: string,
  ): Promise<RunChangeSet> {
    const final = await snapshotWorkspace(workspacePath);
    const before = restoreSnapshot(baseline);
    return {
      source: "snapshot",
      files: reportableChanges(diffSnapshots(before, final)),
      truncated: before.truncated || final.truncated,
      capturedAt,
    };
  }

  private async gitChanges(
    workspacePath: string,
    baselineGit: NonNullable<RunChangeBaseline["git"]>,
  ): Promise<FileChange[] | undefined> {
    const status = await this.git(workspacePath, STATUS_ARGS);
    if (status === undefined) {
      return undefined;
    }
    const committed = await this.committedChanges(workspacePath, baselineGit.head);
    const finalDirty = parseGitStatus(status);
    const blobs = await this.hashObjects(
      workspacePath,
      pathsWithContent(stillDirtyAtBaseline(finalDirty, baselineGit.dirty)),
    );
    return reportableChanges(
      mergeGitChanges(baselineGit.dirty, withBlobs(finalDirty, blobs), committed),
    );
  }

  private async committedChanges(
    workspacePath: string,
    baselineHead: string | undefined,
  ): Promise<FileChange[]> {
    const head = (await this.git(workspacePath, ["rev-parse", "HEAD"]))?.trim();
    if (head === undefined || head === baselineHead) {
      return [];
    }
    const diff = await this.git(workspacePath, [
      "diff",
      "--name-status",
      "-z",
      baselineHead ?? EMPTY_TREE_OBJECT,
      head,
    ]);
    return diff === undefined ? [] : parseGitNameStatus(diff);
  }

  private async gitBaseline(
    workspacePath: string,
  ): Promise<RunChangeBaseline["git"]> {
    if (!(await isRepositoryRoot(workspacePath))) {
      return undefined;
    }
    const status = await this.git(workspacePath, STATUS_ARGS);
    if (status === undefined) {
      return undefined;
    }
    const head = (await this.git(workspacePath, ["rev-parse", "HEAD"]))?.trim();
    const dirty = parseGitStatus(status);
    const blobs = await this.hashObjects(workspacePath, pathsWithContent(dirty));
    return {
      head: head || undefined,
      dirty: withBlobs(dirty, blobs),
    };
  }

  private async hashObjects(workspacePath: string, paths: string[]): Promise<BlobIndex> {
    if (paths.length === 0) {
      return new Map();
    }
    const output = await this.git(workspacePath, HASH_OBJECT_ARGS, `${paths.join("\n")}\n`);
    const oids =
      output === undefined
        ? []
        : output
            .split("\n")
            .map((line) => line.trim())
            .filter((oid) => oid !== "");
    if (oids.length !== paths.length) {
      return new Map();
    }
    return new Map(paths.map((filePath, index) => [filePath, oids[index]]));
  }

  private async git(
    cwd: string,
    args: string[],
    input?: string,
  ): Promise<string | undefined> {
    const result = await this.deps.run({
      command: "git",
      args,
      cwd,
      input,
      timeoutMs: GIT_TIMEOUT_MS,
    });
    return result.success ? result.stdout : undefined;
  }
}

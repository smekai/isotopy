import { createHash } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import type { Dirent } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { InstallPackRequest, PackInstallResult } from "@isotopy/core";
import { planPackInstall, sameSource } from "../domain/rules/pack-plan.ts";
import type {
  PackFile,
  PackIdentity,
  PackInstallPlan,
  PackRecord,
} from "../domain/rules/pack-plan.ts";
import { packSourceOf } from "../domain/rules/pack-source.ts";
import type { PackSource } from "../domain/rules/pack-source.ts";
import { SKILL_ID } from "../domain/rules/persona-notes.ts";
import type { ValidationIssue, ValidationResult } from "../domain/validation.ts";
import { runSubprocess } from "../engines/subprocess.ts";
import type { SubprocessResult } from "../engines/subprocess.ts";
import { ensureProjectDataDir } from "../paths.ts";
import type { ProjectPath } from "../paths.ts";
import {
  parseAgentFile,
  parseDutyFile,
  parseKnowledgeFile,
  parseStepFile,
} from "../schemas/agent-definition.ts";
import { errorCodeOf } from "../utils/error-code.ts";
import type { Logger } from "../utils/logger.ts";
import { lookupOnPath } from "../utils/lookup-on-path.ts";
import { messageOf } from "../utils/message-of.ts";
import { nowIso } from "../utils/time.ts";
import { readPackRecords, writePackRecords } from "./pack-records.ts";

export interface DutySeeding {
  seedDuties(projectPath: ProjectPath): Promise<void>;
}

export type PackInstallOutcome =
  | { kind: "installed"; result: PackInstallResult }
  | { kind: "invalid"; issues: ValidationIssue[] }
  | { kind: "conflict"; issues: ValidationIssue[] }
  | { kind: "busy" };

export interface MaterializedPack {
  root: string;
  commit?: string;
}

type PackEntryKind = "agent" | "knowledge" | "duty" | "step";

interface PackEntry {
  kind: PackEntryKind;
  id: string;
  path: string;
  file: string;
}

interface ReadEntry extends PackEntry {
  sha256: string;
  text: string;
}

type GitPackSource = Extract<PackSource, { kind: "git" }>;

const CLONE_PREFIX = "isotopy-pack-";

const GIT_TIMEOUT_MS = 120_000;

const GIT_MISSING =
  "Git is not on PATH. Install it (winget install --id Git.Git -e on Windows, brew install git on macOS) and restart Isotopy.";

const AGENT_FILE = "agent.md";

const MARKDOWN = ".md";

const LIBRARY_KINDS: ReadonlyMap<string, PackEntryKind> = new Map([
  ["knowledge", "knowledge"],
  ["duties", "duty"],
]);

export class PackInstaller {
  private readonly logger: Logger;
  private readonly installing = new Set<string>();

  constructor(
    private readonly duties: DutySeeding,
    logger: Logger,
    private readonly tempRoot: string = os.tmpdir(),
  ) {
    this.logger = logger.child("PackInstaller");
  }

  async install(
    projectPath: ProjectPath,
    request: InstallPackRequest,
  ): Promise<PackInstallOutcome> {
    const source = packSourceOf(request);
    if (!source.ok) {
      return { kind: "invalid", issues: source.issues };
    }
    if (this.installing.has(projectPath.id)) {
      return { kind: "busy" };
    }
    this.installing.add(projectPath.id);
    try {
      return await this.installFrom(projectPath, source.value);
    } finally {
      this.installing.delete(projectPath.id);
    }
  }

  private async installFrom(
    projectPath: ProjectPath,
    source: PackSource,
  ): Promise<PackInstallOutcome> {
    if (source.kind === "folder") {
      const folder = await existingFolder(source.folder, ["source"]);
      return folder.ok
        ? this.installRoot(projectPath, source, { root: folder.value })
        : { kind: "invalid", issues: folder.issues };
    }
    const workspace = await mkdtemp(path.join(this.tempRoot, CLONE_PREFIX));
    try {
      const clone = await this.clone(source, workspace);
      return clone.ok
        ? await this.installRoot(projectPath, source, clone.value)
        : { kind: "invalid", issues: clone.issues };
    } finally {
      await rm(workspace, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(
        (error: unknown) => this.logger.warn(`Could not remove ${workspace}: ${messageOf(error)}`),
      );
    }
  }

  private async clone(
    source: GitPackSource,
    workspace: string,
  ): Promise<ValidationResult<MaterializedPack>> {
    if (lookupOnPath("git") === undefined) {
      return refused(["source"], GIT_MISSING);
    }
    const target = path.join(workspace, "clone");
    const branch = source.ref === undefined ? [] : ["--branch", source.ref];
    const cloned = await git(workspace, [
      "-c",
      "core.longpaths=true",
      "clone",
      "--depth",
      "1",
      ...branch,
      "--",
      source.url,
      target,
    ]);
    if (!cloned.success) {
      return refused(["source"], `git clone ${source.url} failed: ${failureOf(cloned)}`);
    }
    const head = await git(target, ["rev-parse", "HEAD"]);
    const root =
      source.subpath === undefined ? target : path.join(target, ...source.subpath.split("/"));
    const folder = await existingFolder(root, ["path"]);
    if (!folder.ok) {
      return folder;
    }
    return { ok: true, value: { root, commit: head.success ? head.stdout.trim() : undefined } };
  }

  private async installRoot(
    projectPath: ProjectPath,
    source: PackSource,
    pack: MaterializedPack,
  ): Promise<PackInstallOutcome> {
    const entries = await packEntries(pack.root);
    if (!entries.ok) {
      return { kind: "invalid", issues: entries.issues };
    }
    const read = await Promise.all(entries.value.map(readEntry));
    const issues = read.flatMap(definitionIssues);
    if (issues.length > 0) {
      return { kind: "invalid", issues };
    }
    const records = await readPackRecords(projectPath);
    if (!records.ok) {
      return { kind: "invalid", issues: records.issues.map(inPacksFile) };
    }
    const identity = identityOf(source);
    const plan = planPackInstall({
      identity,
      incoming: read.map(toPackFile),
      records: records.value,
      onDisk: await hashesOnDisk(projectPath, read, records.value, identity),
    });
    if (plan.conflicts.length > 0) {
      return { kind: "conflict", issues: plan.conflicts };
    }
    const record: PackRecord = {
      ...identity,
      ref: source.kind === "git" ? source.ref : undefined,
      commit: pack.commit,
      installedAt: nowIso(),
      files: read.map(toPackFile),
    };
    await this.apply(projectPath, plan, read);
    await writePackRecords(projectPath, [
      ...records.value.filter((existing) => !sameSource(existing, identity)),
      record,
    ]);
    await this.duties.seedDuties(projectPath);
    this.logger.info(
      `Installed ${identity.source}: ${plan.writes.length} written, ${plan.removals.length} removed`,
      { projectId: projectPath.id },
    );
    return { kind: "installed", result: resultOf(record, plan) };
  }

  private async apply(
    projectPath: ProjectPath,
    plan: PackInstallPlan,
    read: ReadEntry[],
  ): Promise<void> {
    await ensureProjectDataDir(projectPath);
    const writes = new Set(plan.writes);
    for (const entry of read.filter((candidate) => writes.has(candidate.path))) {
      const target = targetOf(projectPath, entry.path);
      await mkdir(path.dirname(target), { recursive: true });
      await copyFile(entry.file, target);
    }
    for (const removed of plan.removals) {
      await rm(targetOf(projectPath, removed), { force: true });
    }
  }
}

async function existingFolder(
  folder: string,
  issuePath: ValidationIssue["path"],
): Promise<ValidationResult<string>> {
  const stats = await stat(folder).catch(absentAsUndefined);
  if (stats === undefined || !stats.isDirectory()) {
    return refused(issuePath, `${folder} is not a folder`);
  }
  return { ok: true, value: folder };
}

function git(cwd: string, args: string[]): Promise<SubprocessResult> {
  return runSubprocess({
    command: "git",
    args,
    cwd,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never" },
    timeoutMs: GIT_TIMEOUT_MS,
  });
}

function failureOf(result: SubprocessResult): string {
  return [result.errorMessage, ...result.stderrTail].filter(Boolean).join(" ").trim();
}

async function packEntries(root: string): Promise<ValidationResult<PackEntry[]>> {
  const issues: ValidationIssue[] = [];
  const entries: PackEntry[] = [];
  for (const agent of await entriesOf(path.join(root, "agents"))) {
    const folder = `agents/${agent.name}`;
    if (refusedEntry(agent, folder, issues) || !agent.isDirectory()) {
      continue;
    }
    if (!SKILL_ID.test(agent.name)) {
      issues.push({ path: [folder], message: `${folder} must be named by a lowercase id` });
      continue;
    }
    for (const item of await entriesOf(path.join(root, "agents", agent.name))) {
      const relative = `${folder}/${item.name}`;
      if (refusedEntry(item, relative, issues)) {
        continue;
      }
      if (item.isFile() && item.name === AGENT_FILE) {
        entries.push({ kind: "agent", id: agent.name, path: relative, file: path.join(root, relative) });
      }
      const libraryKind = item.isDirectory() ? LIBRARY_KINDS.get(item.name) : undefined;
      if (libraryKind !== undefined) {
        entries.push(...(await markdownEntries(root, relative, libraryKind, agent.name, issues)));
      }
    }
  }
  entries.push(...(await markdownEntries(root, "steps", "step", undefined, issues)));
  return issues.length > 0 ? { ok: false, issues } : { ok: true, value: entries };
}

async function markdownEntries(
  root: string,
  folder: string,
  kind: PackEntryKind,
  agentId: string | undefined,
  issues: ValidationIssue[],
): Promise<PackEntry[]> {
  const found: PackEntry[] = [];
  for (const item of await entriesOf(path.join(root, ...folder.split("/")))) {
    const relative = `${folder}/${item.name}`;
    if (refusedEntry(item, relative, issues) || !item.isFile() || !item.name.endsWith(MARKDOWN)) {
      continue;
    }
    const id = agentId ?? item.name.slice(0, -MARKDOWN.length);
    found.push({ kind, id, path: relative, file: path.join(root, ...relative.split("/")) });
  }
  return found;
}

function refusedEntry(entry: Dirent, relative: string, issues: ValidationIssue[]): boolean {
  if (!entry.isSymbolicLink()) {
    return false;
  }
  issues.push({ path: [relative], message: `${relative} is a link; a pack may only hold plain files` });
  return true;
}

async function readEntry(entry: PackEntry): Promise<ReadEntry> {
  const bytes = await readFile(entry.file);
  return {
    ...entry,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    text: bytes.toString("utf8"),
  };
}

function definitionIssues(entry: ReadEntry): ValidationIssue[] {
  const parsed = parseEntry(entry);
  return parsed.ok
    ? []
    : parsed.issues.map((issue) => ({
        path: [entry.path, ...issue.path],
        message: `${entry.path}: ${issue.message}`,
      }));
}

function parseEntry(entry: ReadEntry): ValidationResult<unknown> {
  switch (entry.kind) {
    case "agent":
      return parseAgentFile(entry.id, entry.text);
    case "knowledge":
      return parseKnowledgeFile(entry.text);
    case "duty":
      return parseDutyFile(entry.text);
    case "step":
      return parseStepFile(entry.id, entry.text);
    default:
      return assertNever(entry.kind);
  }
}

async function hashesOnDisk(
  projectPath: ProjectPath,
  read: ReadEntry[],
  records: PackRecord[],
  identity: PackIdentity,
): Promise<Map<string, string>> {
  const previous = records.find((record) => sameSource(record, identity))?.files ?? [];
  const targets = [...new Set([...read.map((entry) => entry.path), ...previous.map((file) => file.path)])];
  const hashes = await Promise.all(
    targets.map(async (target) => {
      const bytes = await readFile(targetOf(projectPath, target)).catch(absentAsUndefined);
      return bytes === undefined
        ? undefined
        : ([target, createHash("sha256").update(bytes).digest("hex")] as const);
    }),
  );
  return new Map(hashes.filter((entry) => entry !== undefined));
}

function identityOf(source: PackSource): PackIdentity {
  return source.kind === "folder"
    ? { source: source.folder }
    : { source: source.url, path: source.subpath };
}

function resultOf(record: PackRecord, plan: PackInstallPlan): PackInstallResult {
  return {
    source: record.source,
    ref: record.ref,
    path: record.path,
    commit: record.commit,
    installedAt: record.installedAt,
    written: plan.writes,
    removed: plan.removals,
    kept: plan.kept,
  };
}

function toPackFile(entry: ReadEntry): PackFile {
  return { path: entry.path, sha256: entry.sha256 };
}

function targetOf(projectPath: ProjectPath, relative: string): string {
  return path.join(projectPath.dataDir, ...relative.split("/"));
}

function inPacksFile(issue: ValidationIssue): ValidationIssue {
  return { path: ["packs.json", ...issue.path], message: `packs.json: ${issue.message}` };
}

async function entriesOf(directory: string): Promise<Dirent[]> {
  const entries = await readdir(directory, { withFileTypes: true }).catch(absentAsUndefined);
  return (entries ?? []).sort((left, right) => left.name.localeCompare(right.name));
}

function absentAsUndefined(error: unknown): undefined {
  if (errorCodeOf(error) === "ENOENT") {
    return undefined;
  }
  throw error;
}

function refused(issuePath: ValidationIssue["path"], message: string): ValidationResult<never> {
  return { ok: false, issues: [{ path: issuePath, message }] };
}

function assertNever(value: never): never {
  throw new Error(`Unhandled pack entry kind: ${String(value)}`);
}

import type { ValidationIssue } from "../validation.ts";

export interface PackFile {
  path: string;
  sha256: string;
}

export interface PackRecord {
  source: string;
  ref?: string;
  path?: string;
  commit?: string;
  installedAt: string;
  files: PackFile[];
}

export interface PackInstallInput {
  identity: PackIdentity;
  incoming: PackFile[];
  records: PackRecord[];
  onDisk: ReadonlyMap<string, string>;
}

export interface PackIdentity {
  source: string;
  path?: string;
}

export interface PackInstallPlan {
  writes: string[];
  removals: string[];
  kept: string[];
  conflicts: ValidationIssue[];
}

export function sameSource(record: PackRecord, identity: PackIdentity): boolean {
  return record.source === identity.source && record.path === identity.path;
}

export function planPackInstall({
  identity,
  incoming,
  records,
  onDisk,
}: PackInstallInput): PackInstallPlan {
  const previous = new Map(
    records.find((record) => sameSource(record, identity))?.files.map(toEntry) ?? [],
  );
  const others = new Map(
    records
      .filter((record) => !sameSource(record, identity))
      .flatMap((record) => record.files.map((file) => [file.path, record.source] as const)),
  );
  const plan: PackInstallPlan = { writes: [], removals: [], kept: [], conflicts: [] };
  for (const file of incoming) {
    placeIncoming(plan, file, onDisk.get(file.path), previous.get(file.path), others.get(file.path));
  }
  const shipped = new Set(incoming.map((file) => file.path));
  for (const [dropped, recordedHash] of previous) {
    if (!shipped.has(dropped)) {
      placeDropped(plan, dropped, onDisk.get(dropped), recordedHash);
    }
  }
  return plan;
}

function placeIncoming(
  plan: PackInstallPlan,
  file: PackFile,
  diskHash: string | undefined,
  recordedHash: string | undefined,
  otherSource: string | undefined,
): void {
  if (otherSource !== undefined) {
    plan.conflicts.push(conflict(file.path, `installed by another pack, ${otherSource}`));
    return;
  }
  if (diskHash === undefined) {
    plan.writes.push(file.path);
    return;
  }
  if (diskHash === file.sha256) {
    plan.kept.push(file.path);
    return;
  }
  if (recordedHash === undefined) {
    plan.conflicts.push(conflict(file.path, "already exists, and no pack installed it"));
    return;
  }
  if (recordedHash !== diskHash) {
    plan.conflicts.push(conflict(file.path, "edited since this pack installed it"));
    return;
  }
  plan.writes.push(file.path);
}

function placeDropped(
  plan: PackInstallPlan,
  dropped: string,
  diskHash: string | undefined,
  recordedHash: string,
): void {
  if (diskHash === undefined) {
    return;
  }
  if (diskHash === recordedHash) {
    plan.removals.push(dropped);
    return;
  }
  plan.kept.push(dropped);
}

function toEntry(file: PackFile): [string, string] {
  return [file.path, file.sha256];
}

function conflict(file: string, reason: string): ValidationIssue {
  return { path: [file], message: `${file} is ${reason}` };
}

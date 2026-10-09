import { rm } from "node:fs/promises";
import path from "node:path";
import type {
  DeploymentResult,
  RunCloseoutRecord,
  RunChangeSet,
  RunReleaseRecord,
} from "@isotopy/core";
import {
  renderCancelledCleanupReport,
  renderCleanupReport,
  renderCloseout,
} from "../domain/markdown/closeout.ts";
import {
  renderDeploymentResult,
  renderReleaseManifest,
} from "../domain/markdown/release.ts";
import { renderRunChanges } from "../domain/markdown/run-changes.ts";
import { parseRunChangeBaseline } from "../schemas/run-change-baseline.ts";
import type { RunChangeBaseline } from "../schemas/run-change-baseline.ts";
import { runsDir } from "../paths.ts";
import type { ProjectPath } from "../paths.ts";
import { readOptionalText, writeTextFile } from "../utils/text-file.ts";

export async function persistRunCloseout(
  project: ProjectPath,
  runId: string,
  record: RunCloseoutRecord,
): Promise<void> {
  const directory = path.join(runsDir(project), runId, "closeout");
  await Promise.all([
    writeTextFile(path.join(directory, "closeout.json"), JSON.stringify(record, null, 2)),
    writeTextFile(path.join(directory, "closeout.md"), renderCloseout(record.report)),
    writeTextFile(path.join(directory, "cleanup-report.md"), renderCleanupReport(record.cleanup)),
  ]);
}

function changesDir(project: ProjectPath, runId: string): string {
  return path.join(runsDir(project), runId, "changes");
}

export async function persistRunChangeBaseline(
  project: ProjectPath,
  runId: string,
  baseline: RunChangeBaseline,
): Promise<void> {
  await writeTextFile(path.join(changesDir(project, runId), "baseline.json"), JSON.stringify(baseline));
}

export async function readRunChangeBaseline(
  project: ProjectPath,
  runId: string,
): Promise<RunChangeBaseline | undefined> {
  const content = await readOptionalText(path.join(changesDir(project, runId), "baseline.json"));
  if (content === undefined) {
    return undefined;
  }
  const parsed = parseRunChangeBaseline(content);
  return parsed.ok ? parsed.value : undefined;
}

export async function persistRunChanges(
  project: ProjectPath,
  runId: string,
  changes: RunChangeSet,
): Promise<void> {
  const directory = changesDir(project, runId);
  await Promise.all([
    writeTextFile(path.join(directory, "changes.json"), JSON.stringify(changes, null, 2)),
    writeTextFile(path.join(directory, "changes.md"), renderRunChanges(changes)),
  ]);
}

export async function cleanupCancelledRun(
  project: ProjectPath,
  runId: string,
): Promise<void> {
  await rm(path.join(runsDir(project), runId, "tmp"), {
    recursive: true,
    force: true,
    maxRetries: 3,
  });
  await writeTextFile(
    path.join(runsDir(project), runId, "closeout", "cleanup-report.md"),
    renderCancelledCleanupReport(),
  );
}

async function writeDeploymentEvidence(
  directory: string,
  deployment: DeploymentResult,
  logLines: string[],
): Promise<void> {
  await Promise.all([
    writeTextFile(path.join(directory, "deployment.json"), JSON.stringify(deployment, null, 2)),
    writeTextFile(path.join(directory, "deployment.md"), renderDeploymentResult(deployment)),
    writeTextFile(path.join(directory, "deploy.log"), logLines.join("\n")),
  ]);
}

export async function persistReleaseArtifacts(
  project: ProjectPath,
  runId: string,
  release: RunReleaseRecord,
): Promise<void> {
  const directory = path.join(runsDir(project), runId, "release");
  await Promise.all([
    writeTextFile(path.join(directory, "release.json"), JSON.stringify(release, null, 2)),
    writeTextFile(path.join(directory, "release.md"), renderReleaseManifest(release.manifest)),
  ]);
}

export function persistRunDeploymentArtifacts(
  project: ProjectPath,
  runId: string,
  deployment: DeploymentResult,
  logLines: string[],
): Promise<void> {
  return writeDeploymentEvidence(
    path.join(runsDir(project), runId, "deploy"),
    deployment,
    logLines,
  );
}

export function persistProjectDeploymentArtifacts(
  project: ProjectPath,
  deploymentId: string,
  deployment: DeploymentResult,
  logLines: string[],
): Promise<void> {
  return writeDeploymentEvidence(
    path.join(project.dataDir, "deployments", deploymentId),
    deployment,
    logLines,
  );
}

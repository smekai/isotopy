import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  DeploymentResult,
  RunArtifactRecord,
  RunChangeSet,
  RunReleaseRecord,
} from "@adhd/core";
import {
  renderCancelledCleanupReport,
  renderRunArtifacts,
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

export async function persistRunArtifacts(
  project: ProjectPath,
  runId: string,
  record: RunArtifactRecord,
): Promise<void> {
  const directory = path.join(runsDir(project), runId, "artifacts");
  await mkdir(directory, { recursive: true });
  await Promise.all([
    writeFile(
      path.join(directory, "artifacts.json"),
      `${JSON.stringify(record, null, 2)}\n`,
    ),
    writeFile(path.join(directory, "artifacts.md"), renderRunArtifacts(record.report)),
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
  const directory = changesDir(project, runId);
  await mkdir(directory, { recursive: true });
  await writeFile(
    path.join(directory, "baseline.json"),
    `${JSON.stringify(baseline)}\n`,
  );
}

export async function readRunChangeBaseline(
  project: ProjectPath,
  runId: string,
): Promise<RunChangeBaseline | undefined> {
  let content: string;
  try {
    content = await readFile(path.join(changesDir(project, runId), "baseline.json"), "utf8");
  } catch {
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
  await mkdir(directory, { recursive: true });
  await Promise.all([
    writeFile(
      path.join(directory, "changes.json"),
      `${JSON.stringify(changes, null, 2)}\n`,
    ),
    writeFile(path.join(directory, "changes.md"), renderRunChanges(changes)),
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
  const closeoutDir = path.join(runsDir(project), runId, "closeout");
  await mkdir(closeoutDir, { recursive: true });
  await writeFile(
    path.join(closeoutDir, "cleanup-report.md"),
    renderCancelledCleanupReport(),
  );
}

async function writeDeploymentEvidence(
  directory: string,
  deployment: DeploymentResult,
  logLines: string[],
): Promise<void> {
  await mkdir(directory, { recursive: true });
  await Promise.all([
    writeFile(
      path.join(directory, "deployment.json"),
      `${JSON.stringify(deployment, null, 2)}\n`,
    ),
    writeFile(path.join(directory, "deployment.md"), renderDeploymentResult(deployment)),
    writeFile(
      path.join(directory, "deploy.log"),
      logLines.length === 0 ? "" : `${logLines.join("\n")}\n`,
    ),
  ]);
}

export async function persistReleaseArtifacts(
  project: ProjectPath,
  runId: string,
  release: RunReleaseRecord,
): Promise<void> {
  const directory = path.join(runsDir(project), runId, "release");
  await mkdir(directory, { recursive: true });
  await Promise.all([
    writeFile(
      path.join(directory, "release.json"),
      `${JSON.stringify(release, null, 2)}\n`,
    ),
    writeFile(path.join(directory, "release.md"), renderReleaseManifest(release.manifest)),
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

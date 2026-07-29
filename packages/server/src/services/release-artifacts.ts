import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  DeploymentResult,
  RunReleaseRecord,
} from "@adhd/core";
import {
  renderDeploymentResult,
  renderReleaseManifest,
} from "../domain/markdown/release.ts";
import { runsDir } from "../paths.ts";
import type { ProjectPath } from "../paths.ts";

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
    writeFile(
      path.join(directory, "release.md"),
      renderReleaseManifest(release.manifest),
    ),
  ]);
}

export async function persistDeploymentArtifacts(
  project: ProjectPath,
  runId: string,
  deployment: DeploymentResult,
  logLines: string[],
): Promise<void> {
  const directory = path.join(runsDir(project), runId, "deploy");
  await mkdir(directory, { recursive: true });
  await Promise.all([
    writeFile(
      path.join(directory, "deployment.json"),
      `${JSON.stringify(deployment, null, 2)}\n`,
    ),
    writeFile(
      path.join(directory, "deployment.md"),
      renderDeploymentResult(deployment),
    ),
    writeFile(
      path.join(directory, "deploy.log"),
      logLines.length === 0 ? "" : `${logLines.join("\n")}\n`,
    ),
  ]);
}

export async function persistProjectDeploymentArtifacts(
  project: ProjectPath,
  deploymentId: string,
  deployment: DeploymentResult,
  logLines: string[],
): Promise<void> {
  const directory = path.join(project.dataDir, "deployments", deploymentId);
  await mkdir(directory, { recursive: true });
  await Promise.all([
    writeFile(
      path.join(directory, "deployment.json"),
      `${JSON.stringify(deployment, null, 2)}\n`,
    ),
    writeFile(
      path.join(directory, "deployment.md"),
      renderDeploymentResult(deployment),
    ),
    writeFile(
      path.join(directory, "deploy.log"),
      logLines.length === 0 ? "" : `${logLines.join("\n")}\n`,
    ),
  ]);
}

import path from "node:path";
import type {
  AutomationCommand,
  DeploymentRecord,
  DeploymentResult,
  HealthCheckStatus,
  PlatformCommand,
} from "@isotopy/core";

const DEPLOY_URL_MARKER = /^ISOTOPY_DEPLOY_URL=(https?:\/\/\S+)$/;
const DEPLOY_REF_MARKER = /^ISOTOPY_DEPLOY_REF=(\S+)$/;

export function commandForPlatform(
  command: AutomationCommand,
  platform: NodeJS.Platform,
): PlatformCommand {
  const override = platform === "win32" ? command.windows : command.posix;
  return override ?? { executable: command.executable, args: command.args };
}

export function deploymentWorkingDirectory(projectRoot: string, configured?: string): string {
  const root = path.resolve(projectRoot);
  const workingDirectory = path.resolve(root, configured ?? ".");
  const relative = path.relative(root, workingDirectory);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error("Deployment working directory must stay inside the project");
  }
  return workingDirectory;
}

export function reportedDeploymentUrl(stdout: string, fallback?: string): string | undefined {
  const marker = stdout
    .split(/\r?\n/)
    .map((line) => DEPLOY_URL_MARKER.exec(line.trim())?.[1])
    .filter((value): value is string => value !== undefined)
    .at(-1);
  if (marker === undefined) {
    return fallback;
  }
  try {
    const url = new URL(marker);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : fallback;
  } catch {
    return fallback;
  }
}

export function deploymentVerdict(
  processSucceeded: boolean,
  healthStatus: HealthCheckStatus,
): DeploymentResult["verdict"] {
  return processSucceeded && healthStatus !== "failed" ? "pass" : "fail";
}

export function reportedDeploymentRef(stdout: string): string | undefined {
  return stdout
    .split(/\r?\n/)
    .map((line) => DEPLOY_REF_MARKER.exec(line.trim())?.[1])
    .filter((value): value is string => value !== undefined)
    .at(-1);
}

export function newestFirst(records: DeploymentRecord[]): DeploymentRecord[] {
  return [...records].sort((a, b) => b.result.startedAt.localeCompare(a.result.startedAt));
}

export function rollbackRefFor(records: DeploymentRecord[]): string | undefined {
  const [latest, ...older] = newestFirst(records).filter((record) => record.result.verdict === "pass");
  if (latest === undefined || latest.result.kind === "rollback" || latest.result.ref === undefined) {
    return undefined;
  }
  return older.find(
    (record) =>
      record.result.kind !== "rollback" &&
      record.result.ref !== undefined &&
      record.result.ref !== latest.result.ref,
  )?.result.ref;
}

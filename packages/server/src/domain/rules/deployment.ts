import path from "node:path";
import type {
  AutomationCommand,
  DeploymentResult,
  HealthCheckStatus,
  PlatformCommand,
} from "@adhd/core";

const DEPLOY_URL_MARKER = /^ADHD_DEPLOY_URL=(https?:\/\/\S+)$/;

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

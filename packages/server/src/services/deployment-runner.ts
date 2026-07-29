import path from "node:path";
import type {
  DeploymentAutomation,
  DeploymentEnvironment,
  DeploymentResult,
  PlatformCommand,
} from "@adhd/core";
import { runSubprocess } from "../engines/subprocess.ts";
import type {
  SubprocessResult,
  SubprocessSpec,
  SubprocessStream,
} from "../engines/subprocess.ts";
import type { ProjectPath } from "../paths.ts";

const DEPLOY_URL_MARKER = /^ADHD_DEPLOY_URL=(https?:\/\/\S+)$/;

type SubprocessRunner = (spec: SubprocessSpec) => Promise<SubprocessResult>;
type HealthFetch = (
  input: string,
  init: { signal: AbortSignal },
) => Promise<{ ok: boolean; status: number }>;

export interface DeploymentRunnerDependencies {
  platform: NodeJS.Platform;
  run: SubprocessRunner;
  fetch: HealthFetch;
  now: () => Date;
  sleep: (milliseconds: number) => Promise<void>;
}

export interface RunDeploymentInput {
  project: ProjectPath;
  environment: DeploymentEnvironment;
  target: DeploymentAutomation;
  signal?: AbortSignal;
  onLine?: (stream: SubprocessStream, line: string) => void;
}

function defaultDependencies(): DeploymentRunnerDependencies {
  return {
    platform: process.platform,
    run: runSubprocess,
    fetch: (input, init) => fetch(input, init),
    now: () => new Date(),
    sleep: (milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds)),
  };
}

export function commandForPlatform(
  target: DeploymentAutomation,
  platform: NodeJS.Platform,
): PlatformCommand {
  const override = platform === "win32" ? target.command.windows : target.command.posix;
  return override ?? {
    executable: target.command.executable,
    args: target.command.args,
  };
}

export function deploymentWorkingDirectory(
  projectRoot: string,
  configured: string | null,
): string {
  const root = path.resolve(projectRoot);
  const workingDirectory = path.resolve(root, configured ?? ".");
  const relative = path.relative(root, workingDirectory);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error("Deployment working directory must stay inside the project");
  }
  return workingDirectory;
}

export function deploymentUrl(stdout: string, fallback: string | null): string | null {
  const marker = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .map((line) => line.match(DEPLOY_URL_MARKER)?.[1])
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

async function verifyHealth(
  url: string,
  timeoutMs: number,
  intervalMs: number,
  dependencies: DeploymentRunnerDependencies,
  signal?: AbortSignal,
): Promise<boolean> {
  const deadline = dependencies.now().getTime() + timeoutMs;
  while (!signal?.aborted && dependencies.now().getTime() <= deadline) {
    const attempt = AbortSignal.any([
      AbortSignal.timeout(Math.min(intervalMs, timeoutMs)),
      ...(signal === undefined ? [] : [signal]),
    ]);
    try {
      const response = await dependencies.fetch(url, { signal: attempt });
      if (response.ok) {
        return true;
      }
    } catch {}
    if (dependencies.now().getTime() + intervalMs > deadline) {
      break;
    }
    await dependencies.sleep(intervalMs);
  }
  return false;
}

export class DeploymentRunner {
  private readonly dependencies: DeploymentRunnerDependencies;

  constructor(dependencies: Partial<DeploymentRunnerDependencies> = {}) {
    this.dependencies = { ...defaultDependencies(), ...dependencies };
  }

  async run(input: RunDeploymentInput): Promise<DeploymentResult> {
    const startedAt = this.dependencies.now();
    const command = commandForPlatform(input.target, this.dependencies.platform);
    const cwd = deploymentWorkingDirectory(input.project.root, input.target.command.cwd);
    const processResult = await this.dependencies.run({
      command: command.executable,
      args: command.args,
      cwd,
      timeoutMs: input.target.command.timeoutMs,
      signal: input.signal,
      onLine: input.onLine,
    });
    const url = deploymentUrl(processResult.stdout, input.target.url);
    const healthUrl = input.target.healthUrl ?? url;

    let healthStatus: DeploymentResult["healthStatus"] = "skipped";
    let failureMessage = processResult.errorMessage ?? null;
    if (processResult.success && healthUrl !== null) {
      const healthy = await verifyHealth(
        healthUrl,
        input.target.healthTimeoutMs,
        input.target.healthIntervalMs,
        this.dependencies,
        input.signal,
      );
      healthStatus = healthy ? "passed" : "failed";
      if (!healthy) {
        failureMessage = `Health check did not pass: ${healthUrl}`;
      }
    }

    const passed = processResult.success && healthStatus !== "failed";
    return {
      environment: input.environment,
      provider: input.target.provider,
      verdict: passed ? "pass" : "fail",
      command,
      cwd,
      exitCode: processResult.exitCode,
      durationMs: this.dependencies.now().getTime() - startedAt.getTime(),
      url,
      healthUrl,
      healthStatus,
      failureMessage,
      startedAt: startedAt.toISOString(),
      finishedAt: this.dependencies.now().toISOString(),
    };
  }
}

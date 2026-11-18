import type {
  AutomationCommand,
  DeploymentAutomation,
  DeploymentEnvironment,
  DeploymentKind,
  DeploymentResult,
  HealthCheckStatus,
} from "@isotopy/core";
import {
  commandForPlatform,
  deploymentVerdict,
  deploymentWorkingDirectory,
  reportedDeploymentRef,
  reportedDeploymentUrl,
} from "../domain/rules/deployment.ts";
import { runSubprocess } from "../engines/subprocess.ts";
import type {
  SubprocessResult,
  SubprocessSpec,
  SubprocessStream,
} from "../engines/subprocess.ts";
import type { ProjectPath } from "../paths.ts";
import { pollUntilHealthy } from "../utils/health-poll.ts";
import type { HealthProbe } from "../utils/health-poll.ts";

type SubprocessRunner = (spec: SubprocessSpec) => Promise<SubprocessResult>;

export interface DeploymentRunnerDependencies {
  platform: NodeJS.Platform;
  run: SubprocessRunner;
  probe: HealthProbe;
  now: () => Date;
  sleep: (milliseconds: number) => Promise<void>;
}

export interface RunDeploymentInput {
  project: ProjectPath;
  environment: DeploymentEnvironment;
  target: DeploymentAutomation;
  kind?: DeploymentKind;
  command?: AutomationCommand;
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
  onLine?: (stream: SubprocessStream, line: string) => void;
}

function defaultDependencies(): DeploymentRunnerDependencies {
  return {
    platform: process.platform,
    run: runSubprocess,
    probe: (url, init) => fetch(url, init),
    now: () => new Date(),
    sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  };
}

export class DeploymentRunner {
  private readonly deps: DeploymentRunnerDependencies;

  constructor(deps: Partial<DeploymentRunnerDependencies> = {}) {
    this.deps = { ...defaultDependencies(), ...deps };
  }

  async run(input: RunDeploymentInput): Promise<DeploymentResult> {
    const { target } = input;
    const startedAt = this.deps.now();
    const configured = input.command ?? target.command;
    const command = commandForPlatform(configured, this.deps.platform);
    const cwd = deploymentWorkingDirectory(input.project.root, configured.cwd);
    const execution = await this.deps.run({
      command: command.executable,
      args: command.args,
      cwd,
      env: input.env === undefined ? undefined : { ...process.env, ...input.env },
      timeoutMs: configured.timeoutMs,
      signal: input.signal,
      onLine: input.onLine,
    });
    const url = reportedDeploymentUrl(execution.stdout, target.url);
    const ref = reportedDeploymentRef(execution.stdout);
    const healthUrl = target.healthUrl ?? url;
    const healthStatus = await this.checkHealth(target, healthUrl, execution.success, input.signal);
    const failureMessage =
      healthStatus === "failed"
        ? `Health check did not pass: ${healthUrl}`
        : execution.errorMessage;

    return {
      environment: input.environment,
      kind: input.kind,
      provider: target.provider,
      verdict: deploymentVerdict(execution.success, healthStatus),
      command,
      cwd,
      exitCode: execution.exitCode,
      durationMs: this.deps.now().getTime() - startedAt.getTime(),
      url,
      ref,
      healthUrl,
      healthStatus,
      failureMessage,
      startedAt: startedAt.toISOString(),
      finishedAt: this.deps.now().toISOString(),
    };
  }

  private async checkHealth(
    target: DeploymentAutomation,
    healthUrl: string | undefined,
    processSucceeded: boolean,
    signal?: AbortSignal,
  ): Promise<HealthCheckStatus> {
    if (!processSucceeded || healthUrl === undefined) {
      return "skipped";
    }
    const healthy = await pollUntilHealthy(this.deps, {
      url: healthUrl,
      timeoutMs: target.healthTimeoutMs,
      intervalMs: target.healthIntervalMs,
      signal,
    });
    return healthy ? "passed" : "failed";
  }
}

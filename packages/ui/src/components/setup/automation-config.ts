import type {
  AutomationCommand,
  DeploymentAutomation,
  DeploymentProvider,
  UiAutomation,
  ValidationCommand,
} from "@adhd/core";

const DEPLOY_TIMEOUT_MS = 600_000;
const HEALTH_TIMEOUT_MS = 60_000;
const HEALTH_INTERVAL_MS = 1_000;
const START_TIMEOUT_MS = 120_000;
const READY_TIMEOUT_MS = 60_000;
const VALIDATION_TIMEOUT_MS = 900_000;

export interface DeploymentOption {
  id: DeploymentProvider | "disabled";
  label: string;
  description: string;
}

export const DEPLOYMENT_OPTIONS: DeploymentOption[] = [
  { id: "disabled", label: "Disabled", description: "Do not deploy this environment" },
  { id: "custom", label: "Custom command", description: "Run a project-owned deploy tool" },
  { id: "vercel", label: "Vercel", description: "Deploy with the Vercel CLI" },
  {
    id: "docker-compose",
    label: "Docker Compose",
    description: "Build and start the Compose project",
  },
];

function nodePackageRunner(args: string[]): AutomationCommand {
  return {
    executable: "npx",
    args,
    timeoutMs: DEPLOY_TIMEOUT_MS,
    windows: { executable: "npx.cmd", args },
  };
}

function deployCommand(provider: DeploymentProvider): AutomationCommand {
  if (provider === "vercel") {
    return nodePackageRunner(["vercel", "deploy", "--yes"]);
  }
  if (provider === "docker-compose") {
    return {
      executable: "docker",
      args: ["compose", "up", "--detach", "--build"],
      timeoutMs: DEPLOY_TIMEOUT_MS,
    };
  }
  return { executable: "node", args: ["scripts/deploy.mjs"], timeoutMs: DEPLOY_TIMEOUT_MS };
}

export function deploymentPreset(provider: DeploymentProvider): DeploymentAutomation {
  return {
    provider,
    command: deployCommand(provider),
    healthTimeoutMs: HEALTH_TIMEOUT_MS,
    healthIntervalMs: HEALTH_INTERVAL_MS,
  };
}

export function defaultUiAutomation(): UiAutomation {
  const args = ["run", "dev"];
  return {
    start: {
      executable: "npm",
      args,
      timeoutMs: START_TIMEOUT_MS,
      windows: { executable: "npm.cmd", args },
    },
    healthUrl: "http://localhost:3000",
    readyTimeoutMs: READY_TIMEOUT_MS,
  };
}

export function defaultValidationCommand(taken: ValidationCommand[]): ValidationCommand {
  const args = ["test"];
  return {
    id: unusedValidationId(taken),
    label: "Tests",
    command: {
      executable: "npm",
      args,
      timeoutMs: VALIDATION_TIMEOUT_MS,
      windows: { executable: "npm.cmd", args },
    },
  };
}

function unusedValidationId(taken: ValidationCommand[]): string {
  const used = new Set(taken.map((command) => command.id));
  let ordinal = 1;
  while (used.has(`check-${ordinal}`)) {
    ordinal += 1;
  }
  return `check-${ordinal}`;
}

export function argumentsText(args: string[]): string {
  return args.join("\n");
}

export function argumentsFromText(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((argument) => argument.trim())
    .filter((argument) => argument !== "");
}

export function withCommand(
  command: AutomationCommand,
  update: Partial<AutomationCommand>,
): AutomationCommand {
  const next: AutomationCommand = { ...command, ...update };
  if (next.cwd === undefined || next.cwd.trim() === "") {
    delete next.cwd;
  }
  return next;
}

export function withArguments(
  command: AutomationCommand,
  args: string[],
): AutomationCommand {
  const { windows } = command;
  return windows === undefined || !sameArguments(windows.args, command.args)
    ? withCommand(command, { args })
    : withCommand(command, { args, windows: { executable: windows.executable, args } });
}

export function withWindowsExecutable(
  command: AutomationCommand,
  value: string,
): AutomationCommand {
  const executable = optionalText(value);
  const next = withCommand(command, {});
  if (executable === undefined) {
    delete next.windows;
    return next;
  }
  next.windows = { executable, args: command.windows?.args ?? command.args };
  return next;
}

function sameArguments(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, at) => value === right[at]);
}

export function optionalText(value: string): string | undefined {
  return value.trim() === "" ? undefined : value.trim();
}

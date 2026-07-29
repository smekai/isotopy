import type {
  DeploymentAutomation,
  DeploymentProvider,
  PlatformCommand,
} from "@adhd/core";

export const DEPLOYMENT_OPTIONS: {
  id: DeploymentProvider | "disabled";
  label: string;
  description: string;
}[] = [
  { id: "disabled", label: "Disabled", description: "Do not deploy this environment" },
  { id: "custom", label: "Custom command", description: "Run a project-owned deploy tool" },
  { id: "vercel", label: "Vercel", description: "Deploy with the Vercel CLI" },
  {
    id: "docker-compose",
    label: "Docker Compose",
    description: "Build and start the Compose project",
  },
];

function platformCommand(
  executable: string,
  args: string[],
): PlatformCommand {
  return { executable, args };
}

export function deploymentPreset(
  provider: DeploymentProvider,
): DeploymentAutomation {
  const common = {
    cwd: null,
    timeoutMs: 600_000,
    posix: null,
  };

  if (provider === "vercel") {
    return {
      provider,
      command: {
        executable: "npx",
        args: ["vercel", "deploy", "--yes"],
        windows: platformCommand("npx.cmd", ["vercel", "deploy", "--yes"]),
        ...common,
      },
      url: null,
      healthUrl: null,
      healthTimeoutMs: 60_000,
      healthIntervalMs: 1_000,
      rollbackNotes: null,
    };
  }

  if (provider === "docker-compose") {
    return {
      provider,
      command: {
        executable: "docker",
        args: ["compose", "up", "--detach", "--build"],
        windows: null,
        ...common,
      },
      url: null,
      healthUrl: null,
      healthTimeoutMs: 60_000,
      healthIntervalMs: 1_000,
      rollbackNotes: null,
    };
  }

  return {
    provider,
    command: {
      executable: "node",
      args: ["scripts/deploy.mjs"],
      windows: null,
      ...common,
    },
    url: null,
    healthUrl: null,
    healthTimeoutMs: 60_000,
    healthIntervalMs: 1_000,
    rollbackNotes: null,
  };
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

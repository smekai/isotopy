export const AUTOMATION_CONFIG_VERSION = 1 as const;
export const DEPLOYMENT_PROVIDERS = [
  "custom",
  "vercel",
  "docker-compose",
] as const;

export type DeploymentProvider = (typeof DEPLOYMENT_PROVIDERS)[number];

export interface PlatformCommand {
  executable: string;
  args: string[];
}

export interface AutomationCommand extends PlatformCommand {
  cwd: string | null;
  timeoutMs: number;
  windows: PlatformCommand | null;
  posix: PlatformCommand | null;
}

export interface ValidationCommand {
  id: string;
  label: string;
  command: AutomationCommand;
}

export interface UiAutomation {
  start: AutomationCommand;
  healthUrl: string;
  readyTimeoutMs: number;
}

export interface DeploymentAutomation {
  provider: DeploymentProvider;
  command: AutomationCommand;
  url: string | null;
  healthUrl: string | null;
  healthTimeoutMs: number;
  healthIntervalMs: number;
  rollbackNotes: string | null;
}

export interface ProjectAutomationConfig {
  version: typeof AUTOMATION_CONFIG_VERSION;
  validation: ValidationCommand[];
  ui: UiAutomation | null;
  preview: DeploymentAutomation | null;
  production: DeploymentAutomation | null;
}

export const EMPTY_AUTOMATION_CONFIG: ProjectAutomationConfig = {
  version: AUTOMATION_CONFIG_VERSION,
  validation: [],
  ui: null,
  preview: null,
  production: null,
};

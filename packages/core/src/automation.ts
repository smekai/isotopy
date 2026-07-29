export const AUTOMATION_CONFIG_VERSION = 1 as const;
export const PRODUCTION_DEPLOYMENT_CONFIRMATION = "DEPLOY PRODUCTION" as const;
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

export const DEPLOYMENT_ENVIRONMENTS = ["preview", "production"] as const;
export const DEPLOYMENT_VERDICTS = ["pass", "fail"] as const;
export const HEALTH_CHECK_STATUSES = ["passed", "failed", "skipped"] as const;

export type DeploymentEnvironment = (typeof DEPLOYMENT_ENVIRONMENTS)[number];
export type DeploymentVerdict = (typeof DEPLOYMENT_VERDICTS)[number];
export type HealthCheckStatus = (typeof HEALTH_CHECK_STATUSES)[number];

export interface DeploymentResult {
  environment: DeploymentEnvironment;
  provider: DeploymentProvider;
  verdict: DeploymentVerdict;
  command: PlatformCommand;
  cwd: string;
  exitCode: number | null;
  durationMs: number;
  url: string | null;
  healthUrl: string | null;
  healthStatus: HealthCheckStatus;
  failureMessage: string | null;
  startedAt: string;
  finishedAt: string;
}

export interface DeploymentRecord {
  id: string;
  result: DeploymentResult;
}

export interface ReleaseManifest {
  summary: string;
  changes: string[];
  changelogFragment: string;
  checklist: string[];
  compatibilityNotes: string[];
  deploymentInputs: string[];
  rollbackNotes: string[];
}

export interface RunReleaseRecord {
  manifest: ReleaseManifest;
  validationErrors: string[];
  completedAt: string;
}

export const EMPTY_AUTOMATION_CONFIG: ProjectAutomationConfig = {
  version: AUTOMATION_CONFIG_VERSION,
  validation: [],
  ui: null,
  preview: null,
  production: null,
};

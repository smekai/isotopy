import { z } from "zod";
import type { RunStatus, StageVerdict } from "./runs.ts";
import { requiredText, requiredTexts, timestamp } from "./schema.ts";

export const AUTOMATION_CONFIG_VERSION = 1 as const;

export const PRODUCTION_DEPLOYMENT_CONFIRMATION = "DEPLOY PRODUCTION" as const;

export const PRODUCTION_ROLLBACK_CONFIRMATION = "ROLLBACK PRODUCTION" as const;

export const DEPLOYMENT_PROVIDERS = ["custom", "vercel", "docker-compose"] as const;

export type DeploymentProvider = (typeof DEPLOYMENT_PROVIDERS)[number];

export const DEPLOYMENT_ENVIRONMENTS = ["preview", "production"] as const;

export type DeploymentEnvironment = (typeof DEPLOYMENT_ENVIRONMENTS)[number];

export const DEPLOYMENT_KINDS = ["deploy", "rollback"] as const;

export type DeploymentKind = (typeof DEPLOYMENT_KINDS)[number];

export const DEPLOYMENT_VERDICTS = ["pass", "fail"] as const;

export type DeploymentVerdict = (typeof DEPLOYMENT_VERDICTS)[number];

export const HEALTH_CHECK_STATUSES = ["passed", "failed", "skipped"] as const;

export type HealthCheckStatus = (typeof HEALTH_CHECK_STATUSES)[number];

export interface PlatformCommand {
  executable: string;
  args: string[];
}

export interface AutomationCommand extends PlatformCommand {
  cwd?: string;
  timeoutMs: number;
  windows?: PlatformCommand;
  posix?: PlatformCommand;
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

export interface DeploymentVerification {
  instructions: string;
}

export interface DeploymentAutomation {
  provider: DeploymentProvider;
  command: AutomationCommand;
  url?: string;
  healthUrl?: string;
  healthTimeoutMs: number;
  healthIntervalMs: number;
  rollback?: AutomationCommand;
  verification?: DeploymentVerification;
}

export interface ProjectAutomationConfig {
  version: typeof AUTOMATION_CONFIG_VERSION;
  validation: ValidationCommand[];
  ui?: UiAutomation;
  preview?: DeploymentAutomation;
  production?: DeploymentAutomation;
}

export const EMPTY_AUTOMATION_CONFIG: ProjectAutomationConfig = {
  version: AUTOMATION_CONFIG_VERSION,
  validation: [],
};

const platformCommandSchema = z
  .object({
    executable: requiredText,
    args: z.array(z.string()),
  })
  .strict();

export const deploymentResultSchema = z
  .object({
    environment: z.enum(DEPLOYMENT_ENVIRONMENTS),
    kind: z.enum(DEPLOYMENT_KINDS).optional(),
    provider: z.enum(DEPLOYMENT_PROVIDERS),
    verdict: z.enum(DEPLOYMENT_VERDICTS),
    command: platformCommandSchema,
    cwd: requiredText,
    exitCode: z.number().int().nullable(),
    durationMs: z.number().int().nonnegative(),
    url: requiredText.optional(),
    ref: requiredText.optional(),
    healthUrl: requiredText.optional(),
    healthStatus: z.enum(HEALTH_CHECK_STATUSES),
    failureMessage: requiredText.optional(),
    startedAt: timestamp,
    finishedAt: timestamp,
  })
  .strict();

export type DeploymentResult = z.infer<typeof deploymentResultSchema>;

export interface DeploymentRecord {
  id: string;
  result: DeploymentResult;
  verificationRunId?: string;
  verificationRefusal?: string;
}

export interface ProductionVerificationState {
  runId: string;
  status: RunStatus;
  verdict?: StageVerdict;
}

export interface ProductionStatus {
  latest?: DeploymentRecord;
  verification?: ProductionVerificationState;
  rollbackRef?: string;
}

export const releaseManifestSchema = z
  .object({
    summary: requiredText,
    changes: requiredTexts.min(1),
    changelogFragment: requiredText,
    checklist: requiredTexts.min(1),
    compatibilityNotes: requiredTexts,
    deploymentInputs: requiredTexts,
    rollbackNotes: requiredTexts,
  })
  .strict();

export type ReleaseManifest = z.infer<typeof releaseManifestSchema>;

export const runReleaseRecordSchema = z
  .object({
    manifest: releaseManifestSchema,
    completedAt: timestamp,
  })
  .strict();

export type RunReleaseRecord = z.infer<typeof runReleaseRecordSchema>;

export function deploymentTargetFor(
  config: ProjectAutomationConfig,
  environment: DeploymentEnvironment,
): DeploymentAutomation | undefined {
  return environment === "preview" ? config.preview : config.production;
}

export function withDeploymentTarget(
  config: ProjectAutomationConfig,
  environment: DeploymentEnvironment,
  target: DeploymentAutomation | undefined,
): ProjectAutomationConfig {
  const next = { ...config };
  if (target === undefined) {
    delete next[environment];
    return next;
  }
  return { ...next, [environment]: target };
}

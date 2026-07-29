import path from "node:path";
import {
  AUTOMATION_CONFIG_VERSION,
  DEPLOYMENT_PROVIDERS,
  PRODUCTION_DEPLOYMENT_CONFIRMATION,
} from "@adhd/core";
import type {
  AutomationCommand,
  DeploymentAutomation,
  PlatformCommand,
  ProjectAutomationConfig,
  UiAutomation,
  ValidationCommand,
} from "@adhd/core";
import { z } from "zod";

const text = z.string().trim().min(1);
const args = z.array(z.string());
const httpUrl = z.url().refine((value) => {
  const protocol = new URL(value).protocol;
  return protocol === "http:" || protocol === "https:";
}, "URL must use http or https");

function isProjectRelative(value: string): boolean {
  const normalized = value.replaceAll("\\", "/");
  return (
    !path.posix.isAbsolute(normalized) &&
    !path.win32.isAbsolute(value) &&
    normalized !== ".." &&
    !normalized.startsWith("../") &&
    !normalized.includes("/../")
  );
}

const cwd = z.string().trim().min(1).refine(isProjectRelative, {
  message: "Working directory must stay inside the project",
});

const platformCommandSchema: z.ZodType<PlatformCommand> = z
  .object({
    executable: text,
    args,
  })
  .strict();

export const automationCommandSchema: z.ZodType<AutomationCommand> = z
  .object({
    executable: text,
    args,
    cwd: cwd.nullable(),
    timeoutMs: z.number().int().min(100).max(3_600_000),
    windows: platformCommandSchema.nullable(),
    posix: platformCommandSchema.nullable(),
  })
  .strict();

const validationCommandSchema: z.ZodType<ValidationCommand> = z
  .object({
    id: text.regex(/^[a-z0-9][a-z0-9-]*$/),
    label: text,
    command: automationCommandSchema,
  })
  .strict();

const uiAutomationSchema: z.ZodType<UiAutomation> = z
  .object({
    start: automationCommandSchema,
    healthUrl: httpUrl,
    readyTimeoutMs: z.number().int().min(100).max(600_000),
  })
  .strict();

const deploymentAutomationSchema: z.ZodType<DeploymentAutomation> = z
  .object({
    provider: z.enum(DEPLOYMENT_PROVIDERS),
    command: automationCommandSchema,
    url: httpUrl.nullable(),
    healthUrl: httpUrl.nullable(),
    healthTimeoutMs: z.number().int().min(100).max(600_000),
    healthIntervalMs: z.number().int().min(50).max(60_000),
    rollbackNotes: z.string().trim().min(1).nullable(),
  })
  .strict();

export const automationConfigSchema: z.ZodType<ProjectAutomationConfig> = z
  .object({
    version: z.literal(AUTOMATION_CONFIG_VERSION),
    validation: z.array(validationCommandSchema),
    ui: uiAutomationSchema.nullable(),
    preview: deploymentAutomationSchema.nullable(),
    production: deploymentAutomationSchema.nullable(),
  })
  .strict()
  .superRefine((config, context) => {
    const ids = new Set<string>();
    config.validation.forEach(({ id }, index) => {
      if (ids.has(id)) {
        context.addIssue({
          code: "custom",
          path: ["validation", index, "id"],
          message: `Duplicate validation command id: ${id}`,
        });
      }
      ids.add(id);
    });
  });

export const productionDeploymentRequestSchema = z
  .object({
    confirmation: z.literal(PRODUCTION_DEPLOYMENT_CONFIRMATION),
  })
  .strict();

import path from "node:path";
import {
  AUTOMATION_CONFIG_VERSION,
  DEPLOYMENT_PROVIDERS,
  PRODUCTION_DEPLOYMENT_CONFIRMATION,
  requiredText,
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
import { parseJson } from "../domain/validation.ts";
import type { ValidationResult } from "../domain/validation.ts";

const MAX_COMMAND_TIMEOUT_MS = 3_600_000;
const MAX_READY_TIMEOUT_MS = 600_000;
const MAX_HEALTH_INTERVAL_MS = 60_000;

const text = requiredText.trim();

const httpUrl = z
  .url()
  .refine((value) => value.startsWith("http://") || value.startsWith("https://"), {
    message: "URL must use http or https",
  });

export function isProjectRelative(value: string): boolean {
  const normalized = value.replaceAll("\\", "/");
  return (
    !path.posix.isAbsolute(normalized) &&
    !path.win32.isAbsolute(value) &&
    normalized !== ".." &&
    !normalized.startsWith("../") &&
    !normalized.includes("/../")
  );
}

const workingDirectory = text.refine(isProjectRelative, {
  message: "Working directory must stay inside the project",
});

const platformCommandSchema: z.ZodType<PlatformCommand> = z
  .object({
    executable: text,
    args: z.array(z.string()),
  })
  .strict();

const automationCommandSchema: z.ZodType<AutomationCommand> = z
  .object({
    executable: text,
    args: z.array(z.string()),
    cwd: workingDirectory.optional(),
    timeoutMs: z.number().int().min(100).max(MAX_COMMAND_TIMEOUT_MS),
    windows: platformCommandSchema.optional(),
    posix: platformCommandSchema.optional(),
  })
  .strict();

const validationCommandSchema: z.ZodType<ValidationCommand> = z
  .object({
    id: text.regex(/^[a-z0-9][a-z0-9-]*$/, "Use lower-case letters, digits and dashes"),
    label: text,
    command: automationCommandSchema,
  })
  .strict();

const uiAutomationSchema: z.ZodType<UiAutomation> = z
  .object({
    start: automationCommandSchema,
    healthUrl: httpUrl,
    readyTimeoutMs: z.number().int().min(100).max(MAX_READY_TIMEOUT_MS),
  })
  .strict();

const deploymentAutomationSchema: z.ZodType<DeploymentAutomation> = z
  .object({
    provider: z.enum(DEPLOYMENT_PROVIDERS),
    command: automationCommandSchema,
    url: httpUrl.optional(),
    healthUrl: httpUrl.optional(),
    healthTimeoutMs: z.number().int().min(100).max(MAX_READY_TIMEOUT_MS),
    healthIntervalMs: z.number().int().min(50).max(MAX_HEALTH_INTERVAL_MS),
    rollbackNotes: text.optional(),
  })
  .strict();

export const automationConfigSchema: z.ZodType<ProjectAutomationConfig> = z
  .object({
    version: z.literal(AUTOMATION_CONFIG_VERSION),
    validation: z.array(validationCommandSchema),
    ui: uiAutomationSchema.optional(),
    preview: deploymentAutomationSchema.optional(),
    production: deploymentAutomationSchema.optional(),
  })
  .strict()
  .superRefine((config, context) => {
    const seen = new Set<string>();
    config.validation.forEach(({ id }, index) => {
      if (seen.has(id)) {
        context.addIssue({
          code: "custom",
          path: ["validation", index, "id"],
          message: `Duplicate validation command id: ${id}`,
        });
      }
      seen.add(id);
    });
  });

export const productionDeploymentRequestSchema = z
  .object({
    confirmation: z.literal(PRODUCTION_DEPLOYMENT_CONFIRMATION),
  })
  .strict();

export function parseAutomationConfig(
  content: string,
): ValidationResult<ProjectAutomationConfig> {
  return parseJson(automationConfigSchema, content);
}

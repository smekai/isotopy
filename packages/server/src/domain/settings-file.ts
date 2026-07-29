import { ENGINES, ENGINE_IDS } from "@adhd/core";
import type { EngineId, ProjectPreferencesUpdate } from "@adhd/core";
import { z } from "zod";
import { projectPreferencesUpdateSchema } from "./request-schemas.ts";

export interface EngineConnectionSettings {
  connectionMode: string;
  apiKey?: string;
}

export type EngineSettings = Partial<Record<EngineId, EngineConnectionSettings>>;

export interface ProjectSettings {
  engines: EngineSettings;
  preferences?: ProjectPreferencesUpdate;
}

export interface SettingsFile {
  version: 1;
  defaults: ProjectSettings;
  projects: Record<string, ProjectSettings>;
}

const connectionSchema = z
  .object({
    connectionMode: z.string().trim().min(1),
    apiKey: z.string().optional(),
  })
  .strict();

const engineSettingsSchema = z
  .partialRecord(z.enum(ENGINE_IDS), connectionSchema)
  .superRefine((settings, context) => {
    for (const [engineId, connection] of Object.entries(settings)) {
      if (
        connection &&
        !ENGINES[engineId as EngineId].connections.some(
          (mode) => mode.id === connection.connectionMode,
        )
      ) {
        context.addIssue({
          code: "custom",
          path: [engineId, "connectionMode"],
          message: `Unknown connection mode for ${engineId}`,
        });
      }
    }
  });

const projectSettingsSchema: z.ZodType<ProjectSettings> = z
  .object({
    engines: engineSettingsSchema,
    preferences: projectPreferencesUpdateSchema.optional(),
  })
  .strict();

export const settingsFileSchema: z.ZodType<SettingsFile> = z
  .object({
    version: z.literal(1),
    defaults: projectSettingsSchema,
    projects: z.record(z.string(), projectSettingsSchema),
  })
  .strict();

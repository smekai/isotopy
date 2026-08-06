import { ENGINES, ENGINE_IDS } from "@adhd/core";
import type { EngineId } from "@adhd/core";
import { z } from "zod";
import { projectPreferencesUpdateSchema } from "./request-schemas.ts";

const connectionSchema = z
  .object({
    connectionMode: z.string().trim().min(1),
    apiKey: z.string().optional(),
  })
  .strict();

export type EngineConnectionSettings = z.infer<typeof connectionSchema>;

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

export type EngineSettings = z.infer<typeof engineSettingsSchema>;

const projectSettingsSchema = z
  .object({
    engines: engineSettingsSchema,
    preferences: projectPreferencesUpdateSchema.optional(),
  })
  .strict();

export type ProjectSettings = z.infer<typeof projectSettingsSchema>;

export const settingsFileSchema = z
  .object({
    version: z.literal(1),
    defaults: projectSettingsSchema,
    projects: z.record(z.string(), projectSettingsSchema),
  })
  .strict();

export type SettingsFile = z.infer<typeof settingsFileSchema>;

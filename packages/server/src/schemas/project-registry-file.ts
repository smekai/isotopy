import { z } from "zod";

const text = z.string().trim().min(1);

const storedProjectSchema = z
  .object({
    id: text,
    name: text,
    root: text,
    createdAt: text,
    lastOpenedAt: text.optional(),
  })
  .strict();

export type StoredProject = z.infer<typeof storedProjectSchema>;

export const registryFileSchema = z
  .object({
    version: z.literal(1),
    activeProjectId: text,
    projects: z.array(storedProjectSchema),
  })
  .strict();

export type RegistryFile = z.infer<typeof registryFileSchema>;

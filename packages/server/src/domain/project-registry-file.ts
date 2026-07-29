import type { Project } from "@adhd/core";
import { z } from "zod";

export type StoredProject = Omit<Project, "dataDir">;

export interface RegistryFile {
  version: 1;
  activeProjectId: string;
  projects: StoredProject[];
}

const text = z.string().trim().min(1);

const storedProjectSchema: z.ZodType<StoredProject> = z
  .object({
    id: text,
    name: text,
    root: text,
    createdAt: text,
    lastOpenedAt: text.optional(),
  })
  .strict();

export const registryFileSchema: z.ZodType<RegistryFile> = z
  .object({
    version: z.literal(1),
    activeProjectId: text,
    projects: z.array(storedProjectSchema),
  })
  .strict();

import { z } from "zod";
import { requiredText, timestamp } from "./schema.ts";

export const FILE_CHANGE_KINDS = ["created", "edited", "deleted"] as const;

export type FileChangeKind = (typeof FILE_CHANGE_KINDS)[number];

export const fileChangeSchema = z
  .object({
    path: requiredText,
    kind: z.enum(FILE_CHANGE_KINDS),
  })
  .strict();

export type FileChange = z.infer<typeof fileChangeSchema>;

export const CHANGE_SET_SOURCES = ["git", "snapshot"] as const;

export type ChangeSetSource = (typeof CHANGE_SET_SOURCES)[number];

export const runChangeSetSchema = z
  .object({
    source: z.enum(CHANGE_SET_SOURCES),
    files: z.array(fileChangeSchema),
    truncated: z.boolean(),
    capturedAt: timestamp,
  })
  .strict();

export type RunChangeSet = z.infer<typeof runChangeSetSchema>;

export function summariseChanges(changes: RunChangeSet): string {
  const parts = FILE_CHANGE_KINDS.map((kind) => ({
    kind,
    count: changes.files.filter((file) => file.kind === kind).length,
  }))
    .filter((entry) => entry.count > 0)
    .map((entry) => `${entry.count} ${entry.kind}`);
  return parts.length === 0 ? "No files changed" : parts.join(" · ");
}

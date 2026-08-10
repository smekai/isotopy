import type { FileChangeKind, RunChangeSet } from "@adhd/core";
import { bullet, markdownBlocks, structuralText } from "./format.ts";

const KIND_TITLE: Record<FileChangeKind, string> = {
  created: "Created",
  edited: "Edited",
  deleted: "Deleted",
};

function kindSection(changes: RunChangeSet, kind: FileChangeKind): string | undefined {
  const paths = changes.files
    .filter((file) => file.kind === kind)
    .map((file) => bullet(`\`${structuralText(file.path)}\``));
  return paths.length === 0 ? undefined : `## ${KIND_TITLE[kind]}\n\n${paths.join("\n")}`;
}

export function renderRunChanges(changes: RunChangeSet): string {
  return markdownBlocks(
    [
      "# What changed",
      `Derived from ${changes.source === "git" ? "git" : "a workspace snapshot"}.`,
      changes.files.length === 0 ? "No file changes were detected." : undefined,
      changes.truncated
        ? "The workspace was larger than the snapshot limit, so this list may be incomplete."
        : undefined,
      kindSection(changes, "created"),
      kindSection(changes, "edited"),
      kindSection(changes, "deleted"),
    ],
    true,
  );
}

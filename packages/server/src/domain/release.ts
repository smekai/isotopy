import type { ReleaseManifest } from "@adhd/core";
import { z } from "zod";

const RELEASE_BLOCK = /```adhd-release\s*([\s\S]*?)```/i;
const requiredText = z.string().trim().min(1);
const strings = z.array(requiredText);

export const releaseManifestSchema: z.ZodType<ReleaseManifest> = z
  .object({
    summary: requiredText,
    changes: strings.min(1),
    changelogFragment: requiredText,
    checklist: strings.min(1),
    compatibilityNotes: strings,
    deploymentInputs: strings,
    rollbackNotes: strings,
  })
  .strict();

export interface ParsedReleaseManifest {
  manifest: ReleaseManifest;
  validationErrors: string[];
}

function fallbackManifest(output: string): ReleaseManifest {
  return {
    summary: output.trim() || "Release Manager produced no release text.",
    changes: ["Release handoff validation failed."],
    changelogFragment: "Release handoff validation failed.",
    checklist: ["Correct and revalidate the structured release handoff."],
    compatibilityNotes: [],
    deploymentInputs: [],
    rollbackNotes: [],
  };
}

export function parseReleaseManifest(output: string): ParsedReleaseManifest {
  const block = RELEASE_BLOCK.exec(output)?.[1];
  if (block === undefined) {
    return {
      manifest: fallbackManifest(output),
      validationErrors: ["Missing fenced adhd-release JSON block"],
    };
  }

  let input: unknown;
  try {
    input = JSON.parse(block);
  } catch {
    return {
      manifest: fallbackManifest(output),
      validationErrors: ["adhd-release block is not valid JSON"],
    };
  }

  const parsed = releaseManifestSchema.safeParse(input);
  if (!parsed.success) {
    return {
      manifest: fallbackManifest(output),
      validationErrors: parsed.error.issues.map(
        (issue) =>
          `${issue.path.length > 0 ? issue.path.join(".") : "release"}: ${issue.message}`,
      ),
    };
  }
  return { manifest: parsed.data, validationErrors: [] };
}

import type { DeploymentResult, ReleaseManifest } from "@adhd/core";
import { bullet, markdownBlocks, markdownBody, structuralText } from "./format.ts";

function listSection(title: string, items: string[]): string | undefined {
  return items.length === 0 ? undefined : `## ${title}\n\n${items.map(bullet).join("\n")}`;
}

export function renderReleaseManifest(manifest: ReleaseManifest): string {
  return markdownBlocks(
    [
      "# Release manifest",
      markdownBody(manifest.summary),
      listSection("Changes", manifest.changes),
      `## Changelog fragment\n\n${markdownBody(manifest.changelogFragment)}`,
      listSection("Release checklist", manifest.checklist),
      listSection("Compatibility notes", manifest.compatibilityNotes),
      listSection("Preview deployment inputs", manifest.deploymentInputs),
      listSection("Rollback notes", manifest.rollbackNotes),
    ],
    true,
  );
}

export function renderDeploymentResult(result: DeploymentResult): string {
  return markdownBlocks(
    [
      `# ${structuralText(result.environment)} deployment`,
      `Verdict: **${result.verdict.toUpperCase()}**`,
      `Provider: ${structuralText(result.provider)}`,
      `Command: \`${structuralText(result.command.executable)}\` with ${result.command.args.length} argument(s)`,
      `Working directory: \`${structuralText(result.cwd)}\``,
      result.url === undefined ? undefined : `URL: ${structuralText(result.url)}`,
      result.healthUrl === undefined
        ? "Health check: skipped"
        : `Health check: ${structuralText(result.healthStatus)} — ${structuralText(result.healthUrl)}`,
      result.failureMessage === undefined
        ? undefined
        : `Failure: ${markdownBody(result.failureMessage)}`,
    ],
    true,
  );
}

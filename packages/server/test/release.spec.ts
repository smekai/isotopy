import { expect, test } from "vitest";
import type { DeploymentResult } from "@adhd/core";
import {
  renderDeploymentResult,
  renderReleaseManifest,
} from "../src/domain/markdown/release.ts";
import { parseReleaseManifest } from "../src/domain/release.ts";

const RELEASE = `\`\`\`adhd-release
{
  "summary": "Ready for preview",
  "changes": ["Added release automation"],
  "changelogFragment": "Add release automation.",
  "checklist": ["QA passed"],
  "compatibilityNotes": [],
  "deploymentInputs": ["Use preview config"],
  "rollbackNotes": ["Redeploy previous version"]
}
\`\`\``;

test("a structured release handoff parses into strict domain data", () => {
  const parsed = parseReleaseManifest(RELEASE);

  expect(parsed.validationErrors).toEqual([]);
  expect(parsed.manifest).toMatchObject({
    summary: "Ready for preview",
    changes: ["Added release automation"],
    checklist: ["QA passed"],
  });
});

test("a prose-only release handoff is retained but rejected", () => {
  const parsed = parseReleaseManifest("Ready in prose");

  expect(parsed.validationErrors).toEqual([
    "Missing fenced adhd-release JSON block",
  ]);
  expect(parsed.manifest.summary).toBe("Ready in prose");
});

test("release Markdown omits empty sections and has one terminal newline", () => {
  const parsed = parseReleaseManifest(RELEASE);

  expect(renderReleaseManifest(parsed.manifest)).toBe(
    "# Release manifest\n\n" +
      "Ready for preview\n\n" +
      "## Changes\n\n" +
      "- Added release automation\n\n" +
      "## Changelog fragment\n\n" +
      "Add release automation.\n\n" +
      "## Release checklist\n\n" +
      "- QA passed\n\n" +
      "## Preview deployment inputs\n\n" +
      "- Use preview config\n\n" +
      "## Rollback notes\n\n" +
      "- Redeploy previous version\n",
  );
});

test("deployment Markdown exposes operational evidence without a shell command", () => {
  const result: DeploymentResult = {
    environment: "preview",
    provider: "custom",
    verdict: "pass",
    command: { executable: "node", args: ["scripts/deploy.mjs"] },
    cwd: "/project",
    exitCode: 0,
    durationMs: 100,
    url: "https://preview.example.test",
    healthUrl: "https://preview.example.test/health",
    healthStatus: "passed",
    failureMessage: null,
    startedAt: "2026-07-29T00:00:00.000Z",
    finishedAt: "2026-07-29T00:00:00.100Z",
  };

  expect(renderDeploymentResult(result)).toContain(
    "Command: `node` with 1 argument(s)",
  );
  expect(renderDeploymentResult(result)).toContain(
    "Health check: passed — https://preview.example.test/health",
  );
  expect(renderDeploymentResult(result).endsWith("\n")).toBe(true);
});

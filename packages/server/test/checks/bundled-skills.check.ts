import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { DEMO_PIPELINES, flattenPipelineStages } from "@isotopy/core";
import { parseAgentFile, parseStepFile } from "../../src/schemas/agent-definition.ts";
import {
  loadBundledPersona,
  loadBundledStepTask,
} from "../../src/services/skills.ts";

const BUNDLED_ROOT = fileURLToPath(new URL("../../src/domain/skills/", import.meta.url));
const BUNDLED_PERSONAS = await bundledIds("personas");
const BUNDLED_STEPS = await bundledIds("step-tasks");

const STAGES = DEMO_PIPELINES.flatMap(flattenPipelineStages);
const PROTOCOL_ASSIGNMENTS = [
  ["closeout-feature", "isotopy-closeout"],
  ["mediate-question", "isotopy-orchestrator-decision"],
  ["orchestrate", "isotopy-orchestrator-decision"],
  ["plan-milestone", "isotopy-milestone-plan"],
  ["prepare-release", "isotopy-release"],
  ["review-run", "isotopy-run-artifacts"],
  ["review-run", "isotopy-orchestrator-decision"],
] as const;

describe("bundled skills", () => {
  test.each(BUNDLED_PERSONAS)("persona %s parses and names its own file", async (id) => {
    const parsed = parseAgentFile(id, await readBundled("personas", id));

    expect(parsed).toMatchObject({ ok: true });
  });

  test.each(BUNDLED_STEPS)("step task %s parses and names its own file", async (id) => {
    const parsed = parseStepFile(id, await readBundled("step-tasks", id));

    expect(parsed).toMatchObject({ ok: true });
  });

  test("every persona a shipped pipeline references is bundled", async () => {
    const referenced = STAGES.map((stage) => stage.skill).filter((id) => id !== undefined);

    const loaded = await Promise.all(referenced.map((id) => loadBundledPersona(id)));

    expect(referenced.length).toBeGreaterThan(0);
    expect(
      referenced.filter((_, index) => !loaded[index]),
      "pipeline stages naming a skill with no bundled persona",
    ).toEqual([]);
  });

  test("every step task a shipped pipeline references is bundled", async () => {
    const referenced = STAGES.map((stage) => stage.stepTask).filter((id) => id !== undefined);

    const loaded = await Promise.all(referenced.map((id) => loadBundledStepTask(id)));

    expect(referenced.length).toBeGreaterThan(0);
    expect(
      referenced.filter((_, index) => !loaded[index]),
      "pipeline stages naming a step task with no bundled assignment",
    ).toEqual([]);
  });

  test.each(PROTOCOL_ASSIGNMENTS)(
    "%s emits the %s fence its consumer expects",
    async (stepTask, fence) => {
      const assignment = await loadBundledStepTask(stepTask);

      expect(assignment).toContain(fence);
    },
  );

  test("the Orchestrator persona requires the decision fence its consumer expects", async () => {
    const persona = await loadBundledPersona("orchestrator");

    expect(persona).toContain("isotopy-orchestrator-decision");
  });

  test("QA stays an ordinary workflow step that never owns the product process", async () => {
    const persona = await loadBundledPersona("tester");
    const assignment = await loadBundledStepTask("verify-feature");

    expect(persona).toContain("ordinary agent-backed workflow step");
    expect(persona).toContain("Playwright");
    expect(persona).toContain("Never start, stop or kill the product yourself");
    expect(assignment).toContain("Do not start it yourself");
    expect(assignment).not.toContain("isotopy-qa-result");
  });
});

async function bundledIds(folder: string): Promise<string[]> {
  const entries = await readdir(path.join(BUNDLED_ROOT, folder));
  return entries.filter((entry) => entry.endsWith(".md")).map((entry) => entry.slice(0, -3));
}

function readBundled(folder: string, id: string): Promise<string> {
  return readFile(path.join(BUNDLED_ROOT, folder, `${id}.md`), "utf8");
}

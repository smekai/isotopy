import { mkdir, writeFile } from "node:fs/promises";
import nodepath from "node:path";
import { runsDir } from "../paths.ts";
import type { ProjectPath } from "../paths.ts";

export async function persistHandoff(
  path: ProjectPath,
  runId: string,
  stageId: string,
  content: string,
): Promise<void> {
  try {
    const dir = nodepath.join(runsDir(path), runId, stageId);
    await mkdir(dir, { recursive: true });
    await writeFile(nodepath.join(dir, "handoff.md"), content);
  } catch (error) {
    console.warn(`Failed to write handoff for run ${runId}/${stageId}:`, error);
  }
}

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { runsDir } from "../paths.ts";
import type { ProjectPaths } from "../paths.ts";

export async function persistHandoff(
  paths: ProjectPaths,
  runId: string,
  stageId: string,
  content: string,
): Promise<void> {
  try {
    const dir = path.join(runsDir(paths), runId, stageId);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "handoff.md"), content);
  } catch (error) {
    console.warn(`Failed to write handoff for run ${runId}/${stageId}:`, error);
  }
}

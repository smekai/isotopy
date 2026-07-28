import { loadBundledStepTask } from "./bundled-prompts.ts";

export function loadStepTask(stepTaskId: string): Promise<string | undefined> {
  return loadBundledStepTask(stepTaskId);
}

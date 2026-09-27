// Vitest globalSetup: one temp root for the whole run. Every test app and test project
// makes its folders under it, and the root is deleted once when the run ends — not
// twice per test inside `dispose`, where a Windows runner spent seconds retrying EBUSY
// under the hook timeout.
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    testTempRoot: string;
  }
}

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const root = await mkdtemp(path.join(os.tmpdir(), "isotopy-tests-"));
  project.provide("testTempRoot", root);
  return async () => {
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }).catch(
      (error: unknown) => console.warn(`Could not delete the test temp root ${root}:`, error),
    );
  };
}

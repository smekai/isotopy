// A spec that really adds a project changes the registry every later spec reads,
// so it takes the registration away afterwards and leaves Home active, the way a
// clean machine starts. The folder itself stays under the suite's own temp root:
// the server keeps a removed project's database open, and Windows will not delete
// a file that is still open.
import { mkdir, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Page } from "@playwright/test";
import { HOME_PROJECT_ID } from "@isotopy/core";
import type { ProjectsView } from "@isotopy/core";

const PROJECT_FOLDERS = path.join(os.tmpdir(), "isotopy-e2e", "projects");

export async function makeProjectFolder(): Promise<string> {
  await mkdir(PROJECT_FOLDERS, { recursive: true });
  return mkdtemp(path.join(PROJECT_FOLDERS, "project-"));
}

export async function forgetProjectFolder(page: Page, folder: string): Promise<void> {
  const view = (await (await page.request.get("/projects")).json()) as ProjectsView;
  const registered = view.projects.filter(
    (project) => path.resolve(project.root) === path.resolve(folder),
  );
  for (const project of registered) {
    await page.request.delete(`/projects/${project.id}`);
  }
  await page.request.post(`/projects/${HOME_PROJECT_ID}/activate`);
}

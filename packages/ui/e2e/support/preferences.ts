// Preferences are server state (TASK-065), so they outlive a browser context:
// a pipeline chosen in one spec file is still chosen in the next. Every spec
// resets them first — the isolation a fresh `localStorage` used to give free.
import type { Page } from "@playwright/test";
import type { ProjectPreferences, ProjectPreferencesUpdate, SettingsView } from "@isotopy/core";

export const DEFAULT_PREFERENCES: ProjectPreferencesUpdate = {
  engine: "claude-code",
  modelTier: "balanced",
  engineModels: { "claude-code": null, cursor: null, codex: null },
  permissionMode: "skip",
  pipelineId: "pm-dev-test",
  gates: {},
};

export async function readPreferences(page: Page): Promise<ProjectPreferences> {
  const response = await page.request.get("/settings");
  return ((await response.json()) as SettingsView).preferences;
}

export async function writePreferences(
  page: Page,
  update: ProjectPreferencesUpdate,
): Promise<void> {
  await page.request.put("/settings/preferences", { data: update });
}

// `gates` is a sparse override map, so `{}` merges to nothing and would leave a
// gate one spec turned off turned off for every spec after it. Clearing means
// naming each stored key with `null`, which is what the server treats as "drop
// this override".
export async function resetPreferences(page: Page): Promise<void> {
  const stored = await readPreferences(page);
  const cleared = Object.fromEntries(Object.keys(stored.gates).map((key) => [key, null]));
  await writePreferences(page, { ...DEFAULT_PREFERENCES, gates: cleared });
}

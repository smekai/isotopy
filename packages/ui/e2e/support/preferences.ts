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

export function resetPreferences(page: Page): Promise<void> {
  return writePreferences(page, DEFAULT_PREFERENCES);
}

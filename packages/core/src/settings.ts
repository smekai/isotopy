import type { EngineId } from "./engines.ts";

/** What the UI sees — the API key itself never leaves the server. */
export interface EngineConnectionSettingsView {
  connectionMode: string;
  apiKeyConfigured: boolean;
}

export interface SettingsView {
  engines: Partial<Record<EngineId, EngineConnectionSettingsView>>;
}

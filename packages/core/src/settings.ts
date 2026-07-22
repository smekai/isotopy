import type { EngineId } from "./engines.ts";

export interface EngineConnectionSettingsView {
  connectionMode: string;
  apiKeyConfigured: boolean;
}

export interface SettingsView {
  engines: Partial<Record<EngineId, EngineConnectionSettingsView>>;
}

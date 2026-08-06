import type { ProjectRegistry } from "../project-registry.ts";
import type { SettingsStore } from "../settings-store.ts";

export interface InheritedRunOptions {
  engine?: string;
  model?: string;
  permissionMode?: string;
}

export interface StartRunOptions extends InheritedRunOptions {
  task?: string;
  milestoneId?: string;
  featureId?: string;
  orchestrationId?: string;
  sourceTaskIds?: string[];
}

export interface RunServiceDependencies {
  registry: ProjectRegistry;
  settings?: SettingsStore;
}

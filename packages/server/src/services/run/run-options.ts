import type { EnginePermissionMode, ModelTier } from "@adhd/core";
import type { SeededStart } from "../../domain/rules/run-seeding.ts";

export interface InheritedRunOptions {
  engine?: string;
  model?: string;
  modelTier?: ModelTier;
  permissionMode?: EnginePermissionMode;
}

export interface StartRunOptions extends InheritedRunOptions {
  task?: string;
  milestoneId?: string;
  featureId?: string;
  orchestrationId?: string;
  sourceTaskIds?: string[];
  seeded?: SeededStart;
}

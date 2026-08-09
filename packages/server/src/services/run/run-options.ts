import type { ModelTier } from "@adhd/core";

export interface InheritedRunOptions {
  engine?: string;
  model?: string;
  modelTier?: ModelTier;
  permissionMode?: string;
}

export interface StartRunOptions extends InheritedRunOptions {
  task?: string;
  milestoneId?: string;
  featureId?: string;
  orchestrationId?: string;
  sourceTaskIds?: string[];
}

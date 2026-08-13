import { AUTO_MODEL_OPTION, staticModelsFor } from "@isotopy/core";
import type { EngineModelOption, EngineModelRoster } from "@isotopy/core";

export function modelOption(overrides: Partial<EngineModelOption> = {}): EngineModelOption {
  return { id: "sonnet", label: "Sonnet", hint: "balanced", origin: "static", ...overrides };
}

export function roster(overrides: Partial<EngineModelRoster> = {}): EngineModelRoster {
  return {
    options: [AUTO_MODEL_OPTION, modelOption()],
    staticCheckedOn: staticModelsFor("claude-code").checkedOn,
    ...overrides,
  };
}

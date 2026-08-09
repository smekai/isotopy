import type { EngineId, EngineModelOption, EngineModelRoster } from "@adhd/core";

const CHECKED_ON = "2026-08-07";

export const AUTO_OPTION: EngineModelOption = {
  id: "",
  label: "Auto",
  hint: "use the CLI's own configured default",
  origin: "auto",
};

export function modelOption(overrides: Partial<EngineModelOption> = {}): EngineModelOption {
  return { id: "sonnet", label: "Sonnet", hint: "balanced", origin: "static", ...overrides };
}

export function roster(overrides: Partial<EngineModelRoster> = {}): EngineModelRoster {
  const engine: EngineId = overrides.engine ?? "claude-code";
  return {
    engine,
    options: [AUTO_OPTION, modelOption()],
    staticCheckedOn: CHECKED_ON,
    ...overrides,
  };
}

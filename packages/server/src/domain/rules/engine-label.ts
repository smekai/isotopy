import { ENGINES } from "@isotopy/core";
import type { RunState } from "@isotopy/core";

const UNKNOWN_ENGINE_LABEL = "unknown";

export function engineLabel(run: RunState): string {
  return run.engine ? ENGINES[run.engine].label : UNKNOWN_ENGINE_LABEL;
}

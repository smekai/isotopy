import type { AutoReviewSupport, EngineId } from "@isotopy/core";
import { permissionPlan } from "../domain/rules/permission-plan.ts";
import type { PermissionPlan } from "../domain/rules/permission-plan.ts";
import { probeCommand } from "./subprocess.ts";
import type { EngineRunContext } from "./types.ts";

export interface AutoReviewProbe {
  helpArgs: string[];
  advertised: (help: string) => boolean;
}

const cache = new Map<string, Promise<AutoReviewSupport>>();

function cacheKey(binary: string, helpArgs: string[]): string {
  return [binary, ...helpArgs].join("\0");
}

async function askCli(binary: string, probe: AutoReviewProbe): Promise<AutoReviewSupport> {
  const result = await probeCommand(binary, probe.helpArgs);
  if (!result.success) {
    return "unknown";
  }
  return probe.advertised(result.stdout) ? "available" : "unsupported";
}

export function probeAutoReview(
  binary: string,
  probe: AutoReviewProbe,
): Promise<AutoReviewSupport> {
  const key = cacheKey(binary, probe.helpArgs);
  const cached = cache.get(key);
  if (cached) {
    return cached;
  }
  const pending = askCli(binary, probe).catch((): AutoReviewSupport => "unknown");
  cache.set(key, pending);
  return pending;
}

export function clearAutoReviewCache(): void {
  cache.clear();
}

export async function resolvePermissionPlan(
  engineId: EngineId,
  ctx: EngineRunContext,
  autoReviewSupport: () => Promise<AutoReviewSupport>,
): Promise<PermissionPlan> {
  const support = ctx.permissionMode === "autoReview" ? await autoReviewSupport() : "unknown";
  const plan = permissionPlan(engineId, ctx.permissionMode, support);
  if (plan.notice !== undefined) {
    ctx.onLog({ level: "info", message: plan.notice });
  }
  return plan;
}

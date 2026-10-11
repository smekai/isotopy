import { vi } from "vitest";
import type { CatalogAgent, CatalogStepTask, PackInstallResult } from "@isotopy/core";
import type { AgentCatalogController } from "../../src/hooks/useAgentCatalog";

export function catalogAgent(overrides: Partial<CatalogAgent> = {}): CatalogAgent {
  return {
    kind: "agent",
    id: overrides.id ?? "growth-marketer",
    title: overrides.title ?? "Growth Marketer",
    glyph: overrides.glyph ?? "✶",
    description: overrides.description ?? "Finds the people a product is for.",
    origin: overrides.origin ?? "project",
  };
}

export function catalogStep(overrides: Partial<CatalogStepTask> = {}): CatalogStepTask {
  return {
    kind: "step",
    id: overrides.id ?? "plan-campaign",
    description: overrides.description ?? "Plan one campaign for one audience.",
    origin: overrides.origin ?? "project",
  };
}

export function agentCatalog(
  overrides: Partial<AgentCatalogController> = {},
): AgentCatalogController {
  return {
    agents: overrides.agents ?? [catalogAgent()],
    steps: overrides.steps ?? [catalogStep()],
    ready: overrides.ready ?? true,
    error: overrides.error ?? null,
    reload: overrides.reload ?? vi.fn(() => Promise.resolve()),
    install: overrides.install ?? vi.fn(() => Promise.resolve(installResult())),
  };
}

export function installResult(overrides: Partial<PackInstallResult> = {}): PackInstallResult {
  return {
    source: overrides.source ?? "C:/packs/seo",
    ref: overrides.ref,
    path: overrides.path,
    commit: overrides.commit,
    installedAt: overrides.installedAt ?? "2026-10-11T10:00:00.000Z",
    written: overrides.written ?? ["agents/seo-writer/agent.md"],
    removed: overrides.removed ?? [],
    kept: overrides.kept ?? [],
  };
}

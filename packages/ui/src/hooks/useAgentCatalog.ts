import { useMemo } from "react";
import type { AgentCatalogEntry, CatalogAgent, CatalogStepTask } from "@isotopy/core";
import { fetchAgentCatalog } from "../api";
import { useProjectCollection } from "./useProjectCollection";

export interface AgentCatalogController {
  agents: CatalogAgent[];
  steps: CatalogStepTask[];
  ready: boolean;
  error: string | null;
  reload(): Promise<void>;
}

export function useAgentCatalog(projectId: string, enabled: boolean): AgentCatalogController {
  const { items, ready, error, reload } = useProjectCollection<AgentCatalogEntry>({
    projectId,
    enabled,
    load: fetchAgentCatalog,
    failure: "Failed to load the agents",
  });
  const agents = useMemo(() => items.filter(isAgent), [items]);
  const steps = useMemo(() => items.filter(isStep), [items]);
  return { agents, steps, ready, error, reload };
}

function isAgent(entry: AgentCatalogEntry): entry is CatalogAgent {
  return entry.kind === "agent";
}

function isStep(entry: AgentCatalogEntry): entry is CatalogStepTask {
  return entry.kind === "step";
}

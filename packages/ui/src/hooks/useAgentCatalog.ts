import { useCallback, useMemo } from "react";
import type {
  AgentCatalogEntry,
  CatalogAgent,
  CatalogStepTask,
  InstallPackRequest,
  PackInstallResult,
} from "@isotopy/core";
import { fetchAgentCatalog, installPack } from "../api";
import { useProjectCollection } from "./useProjectCollection";

export interface AgentCatalogController {
  agents: CatalogAgent[];
  steps: CatalogStepTask[];
  ready: boolean;
  error: string | null;
  reload(): Promise<void>;
  install(request: InstallPackRequest): Promise<PackInstallResult>;
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
  const install = useCallback(
    async (request: InstallPackRequest) => {
      const result = await installPack(request);
      await reload();
      return result;
    },
    [reload],
  );
  return { agents, steps, ready, error, reload, install };
}

function isAgent(entry: AgentCatalogEntry): entry is CatalogAgent {
  return entry.kind === "agent";
}

function isStep(entry: AgentCatalogEntry): entry is CatalogStepTask {
  return entry.kind === "step";
}

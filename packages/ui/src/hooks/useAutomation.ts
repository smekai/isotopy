import { useCallback, useEffect, useState } from "react";
import type { ProductionStatus, ProjectAutomationConfig } from "@isotopy/core";
import {
  deployProduction,
  fetchAutomationConfig,
  fetchProductionStatus,
  rollbackProduction,
  updateAutomationConfig,
} from "../api";

export interface AutomationController {
  config: ProjectAutomationConfig | null;
  error: string | null;
  saved: boolean;
  deploying: boolean;
  production: ProductionStatus | null;
  edit(next: ProjectAutomationConfig): void;
  save(): Promise<void>;
  deployToProduction(): Promise<void>;
  rollBackProduction(ref: string): Promise<void>;
  refreshProduction(): Promise<void>;
}

function messageOf(reason: unknown, fallback: string): string {
  return reason instanceof Error ? reason.message : fallback;
}

export function useAutomation(projectId: string): AutomationController {
  const [config, setConfig] = useState<ProjectAutomationConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [production, setProduction] = useState<ProductionStatus | null>(null);

  useEffect(() => {
    let stale = false;
    setConfig(null);
    setError(null);
    setProduction(null);
    void Promise.all([fetchAutomationConfig(), fetchProductionStatus()])
      .then(([value, status]) => {
        if (!stale) {
          setConfig(value);
          setProduction(status);
        }
      })
      .catch((reason: unknown) => {
        if (!stale) {
          setError(messageOf(reason, "Could not load project automation"));
        }
      });
    return () => {
      stale = true;
    };
  }, [projectId]);

  const edit = useCallback((next: ProjectAutomationConfig) => {
    setSaved(false);
    setConfig(next);
  }, []);

  const save = useCallback(async () => {
    if (config === null) {
      return;
    }
    setError(null);
    setSaved(false);
    try {
      setConfig(await updateAutomationConfig(config));
      setSaved(true);
    } catch (reason) {
      setError(messageOf(reason, "Could not save project automation"));
    }
  }, [config]);

  const refreshProduction = useCallback(async () => {
    try {
      setProduction(await fetchProductionStatus());
    } catch (reason) {
      setError(messageOf(reason, "Could not read the production status"));
    }
  }, []);

  const runProductionAction = useCallback(
    async (action: () => Promise<unknown>, failure: string) => {
      if (config === null) {
        return;
      }
      setError(null);
      setSaved(false);
      setDeploying(true);
      try {
        setConfig(await updateAutomationConfig(config));
        await action();
      } catch (reason) {
        setError(messageOf(reason, failure));
      } finally {
        setDeploying(false);
        await refreshProduction();
      }
    },
    [config, refreshProduction],
  );

  const deployToProduction = useCallback(
    () => runProductionAction(deployProduction, "Production deployment failed"),
    [runProductionAction],
  );

  const rollBackProduction = useCallback(
    (ref: string) => runProductionAction(() => rollbackProduction(ref), "Production rollback failed"),
    [runProductionAction],
  );

  return {
    config,
    error,
    saved,
    deploying,
    production,
    edit,
    save,
    deployToProduction,
    rollBackProduction,
    refreshProduction,
  };
}

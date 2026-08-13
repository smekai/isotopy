import { useCallback, useEffect, useState } from "react";
import type { DeploymentResult, ProjectAutomationConfig } from "@isotopy/core";
import {
  deployProduction,
  fetchAutomationConfig,
  updateAutomationConfig,
} from "../api";

export interface AutomationController {
  config: ProjectAutomationConfig | null;
  error: string | null;
  saved: boolean;
  deploying: boolean;
  production: DeploymentResult | null;
  edit(next: ProjectAutomationConfig): void;
  save(): Promise<void>;
  deployToProduction(): Promise<void>;
}

function messageOf(reason: unknown, fallback: string): string {
  return reason instanceof Error ? reason.message : fallback;
}

export function useAutomation(projectId: string): AutomationController {
  const [config, setConfig] = useState<ProjectAutomationConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [production, setProduction] = useState<DeploymentResult | null>(null);

  useEffect(() => {
    let stale = false;
    setConfig(null);
    setError(null);
    setProduction(null);
    void fetchAutomationConfig()
      .then((value) => {
        if (!stale) {
          setConfig(value);
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

  const deployToProduction = useCallback(async () => {
    if (config === null) {
      return;
    }
    setError(null);
    setSaved(false);
    setDeploying(true);
    setProduction(null);
    try {
      setConfig(await updateAutomationConfig(config));
      setProduction((await deployProduction()).result);
    } catch (reason) {
      setError(messageOf(reason, "Production deployment failed"));
    } finally {
      setDeploying(false);
    }
  }, [config]);

  return { config, error, saved, deploying, production, edit, save, deployToProduction };
}

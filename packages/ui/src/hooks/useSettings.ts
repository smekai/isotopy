import { useCallback, useEffect, useRef, useState } from "react";
import { defaultProjectPreferences, mergeProjectPreferences } from "@adhd/core";
import type {
  EngineId,
  ProjectPreferences,
  ProjectPreferencesUpdate,
  SettingsView,
} from "@adhd/core";
import { fetchSettings, updateEngineConnection, updatePreferences } from "../api";
import type { EngineConnectionUpdate } from "../api";
import { clearLegacyPreferences, readLegacyPreferences } from "../legacy-prefs";

export interface SettingsController {
  view: SettingsView | null;
  preferences: ProjectPreferences;
  ready: boolean;
  error: string | null;
  update(update: ProjectPreferencesUpdate): void;
  updateConnection(engineId: EngineId, update: EngineConnectionUpdate): Promise<void>;
}

export function useSettings(projectId: string): SettingsController {
  const [view, setView] = useState<SettingsView | null>(null);
  const [preferences, setPreferences] = useState<ProjectPreferences>(defaultProjectPreferences);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const adoptedProjects = useRef(new Set<string>());

  const apply = useCallback((next: SettingsView) => {
    setView(next);
    setPreferences(next.preferences);
  }, []);

  const reload = useCallback(
    () =>
      fetchSettings()
        .then(apply)
        .catch(() => setError("Could not load settings")),
    [apply],
  );

  const push = useCallback(
    async (update: ProjectPreferencesUpdate) => {
      setError(null);
      setPreferences((current) => mergeProjectPreferences(current, update));
      try {
        apply(await updatePreferences(update));
      } catch {
        setError("Could not save settings");
        await reload();
      }
    },
    [apply, reload],
  );

  const adoptLegacyPreferences = useCallback(
    async (target: string) => {
      if (adoptedProjects.current.has(target)) {
        return;
      }
      adoptedProjects.current.add(target);
      const legacy = readLegacyPreferences(target);
      if (legacy) {
        await push(legacy);
        clearLegacyPreferences(target);
      }
    },
    [push],
  );

  useEffect(() => {
    let stale = false;
    setReady(false);
    void fetchSettings()
      .then((next) => {
        if (!stale) {
          apply(next);
          void adoptLegacyPreferences(projectId);
        }
      })
      .catch(() => {
        if (!stale) {
          setError("Could not load settings");
        }
      })
      .finally(() => {
        if (!stale) {
          setReady(true);
        }
      });
    return () => {
      stale = true;
    };
  }, [projectId, apply, adoptLegacyPreferences]);

  const updateConnection = useCallback(
    async (engineId: EngineId, update: EngineConnectionUpdate) => {
      apply(await updateEngineConnection(engineId, update));
    },
    [apply],
  );

  return {
    view,
    preferences,
    ready,
    error,
    update: (update) => void push(update),
    updateConnection,
  };
}

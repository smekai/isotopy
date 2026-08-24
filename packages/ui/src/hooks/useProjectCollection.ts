import { useCallback, useEffect, useRef, useState } from "react";

export function messageOf(reason: unknown, fallback: string): string {
  return reason instanceof Error ? reason.message : fallback;
}

export interface ProjectCollectionOptions<T> {
  projectId: string;
  enabled: boolean;
  load: () => Promise<T[]>;
  failure: string;
  refreshKey?: string;
  refreshMs?: number;
}

export interface ProjectCollection<T> {
  items: T[];
  ready: boolean;
  error: string | null;
  setItems: (update: (current: T[]) => T[]) => void;
  setError: (message: string | null) => void;
  reload: () => Promise<void>;
}

export function useProjectCollection<T>({
  projectId,
  enabled,
  load,
  failure,
  refreshKey,
  refreshMs,
}: ProjectCollectionOptions<T>): ProjectCollection<T> {
  const [items, setItems] = useState<T[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadedProject = useRef<string | null>(null);
  // The loader is rebuilt on every render by callers that close over api
  // functions, so depending on it would refetch in a loop.
  const loader = useRef(load);
  loader.current = load;

  const reload = useCallback(async () => {
    try {
      setItems(await loader.current());
      setError(null);
    } catch (reason) {
      setError(messageOf(reason, failure));
    }
  }, [failure]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    if (loadedProject.current !== projectId) {
      loadedProject.current = projectId;
      setItems([]);
      setReady(false);
      setError(null);
    }
    let cancelled = false;
    const fetchOnce = () =>
      loader
        .current()
        .then((loaded) => {
          if (!cancelled) {
            setItems(loaded);
            setError(null);
          }
        })
        .catch((reason: unknown) => {
          if (!cancelled) {
            setError(messageOf(reason, failure));
          }
        })
        .finally(() => {
          if (!cancelled) {
            setReady(true);
          }
        });
    void fetchOnce();
    const poll = refreshMs === undefined ? undefined : setInterval(() => void fetchOnce(), refreshMs);
    return () => {
      cancelled = true;
      if (poll !== undefined) {
        clearInterval(poll);
      }
    };
  }, [projectId, enabled, refreshKey, refreshMs, failure]);

  const replaceItems = useCallback((update: (current: T[]) => T[]) => {
    setItems(update);
  }, []);

  return { items, ready, error, setItems: replaceItems, setError, reload };
}

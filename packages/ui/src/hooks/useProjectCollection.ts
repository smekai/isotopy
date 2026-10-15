import { useCallback, useEffect, useRef, useState } from "react";
import { mergeById } from "../merge-by-id";
import type { Identified } from "../merge-by-id";

export function messageOf(reason: unknown, fallback: string): string {
  return reason instanceof Error ? reason.message : fallback;
}

export type ProjectSubscription<T> = (
  projectId: string,
  onUpdate: (item: T) => void,
) => () => void;

export interface ProjectCollectionOptions<T> {
  projectId: string;
  enabled: boolean;
  load: () => Promise<T[]>;
  subscribe?: ProjectSubscription<T>;
  failure: string;
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

export function useProjectCollection<T extends Identified>({
  projectId,
  enabled,
  load,
  subscribe,
  failure,
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
    let beforeFirstLoad: T[] | undefined = [];
    const unsubscribe = subscribe?.(projectId, (update) => {
      if (beforeFirstLoad) {
        beforeFirstLoad.push(update);
        return;
      }
      setItems((current) => mergeById(current, update));
    });
    const fetchOnce = () =>
      loader
        .current()
        .then((loaded) => {
          if (!cancelled) {
            setItems(beforeFirstLoad?.reduce(mergeById, loaded) ?? loaded);
            beforeFirstLoad = undefined;
            setError(null);
          }
        })
        .catch((reason: unknown) => {
          if (!cancelled) {
            beforeFirstLoad = undefined;
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
      unsubscribe?.();
      if (poll !== undefined) {
        clearInterval(poll);
      }
    };
  }, [projectId, enabled, subscribe, refreshMs, failure]);

  const replaceItems = useCallback((update: (current: T[]) => T[]) => {
    setItems(update);
  }, []);

  return { items, ready, error, setItems: replaceItems, setError, reload };
}

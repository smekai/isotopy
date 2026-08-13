import { useCallback, useEffect, useRef, useState } from "react";
import type { ProductProcessStatus } from "@isotopy/core";
import { isProductLive } from "@isotopy/core";
import { fetchProductStatus, startProduct, stopProduct } from "../api";

const STARTING_POLL_MS = 1000;
const RUNNING_POLL_MS = 5000;

export interface ProductController {
  status: ProductProcessStatus | null;
  error: string | null;
  busy: boolean;
  start(): Promise<void>;
  stop(): Promise<void>;
  restart(): Promise<void>;
}

function messageOf(reason: unknown, fallback: string): string {
  return reason instanceof Error ? reason.message : fallback;
}

export function useProduct(projectId: string): ProductController {
  const [status, setStatus] = useState<ProductProcessStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const live = useRef(true);

  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    try {
      const next = await fetchProductStatus();
      if (live.current) {
        setStatus(next);
      }
    } catch (reason) {
      if (live.current) {
        setError(messageOf(reason, "Could not read the product status"));
      }
    }
  }, []);

  useEffect(() => {
    setStatus(null);
    setError(null);
    void load();
  }, [projectId, load]);

  useEffect(() => {
    if (status === null || !isProductLive(status.state)) {
      return;
    }
    const delay = status.state === "starting" ? STARTING_POLL_MS : RUNNING_POLL_MS;
    const timer = setTimeout(() => void load(), delay);
    return () => clearTimeout(timer);
  }, [status, load]);

  const act = useCallback(
    async (request: () => Promise<ProductProcessStatus>, fallback: string) => {
      setError(null);
      setBusy(true);
      try {
        const next = await request();
        if (live.current) {
          setStatus(next);
        }
      } catch (reason) {
        if (live.current) {
          setError(messageOf(reason, fallback));
        }
      } finally {
        if (live.current) {
          setBusy(false);
        }
      }
    },
    [],
  );

  const start = useCallback(
    () => act(startProduct, "Could not start the product"),
    [act],
  );

  const stop = useCallback(() => act(stopProduct, "Could not stop the product"), [act]);

  const restart = useCallback(
    () => act(() => stopProduct().then(startProduct), "Could not restart the product"),
    [act],
  );

  return { status, error, busy, start, stop, restart };
}

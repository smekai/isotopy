import { useEffect, useRef, useState } from "react";
import { bundledRosterFor } from "@adhd/core";
import type { EngineId, EngineModelRoster } from "@adhd/core";
import { fetchEngineModels } from "../api";

export interface EngineRosterState {
  roster: EngineModelRoster;
  unavailable: boolean;
}

export function useEngineRoster(engine: EngineId, refreshKey = 0): EngineRosterState {
  const [roster, setRoster] = useState<EngineModelRoster>(() => bundledRosterFor(engine));
  const [unavailable, setUnavailable] = useState(false);
  const recheckedAt = useRef(refreshKey);

  useEffect(() => {
    let stale = false;
    const recheck = refreshKey !== recheckedAt.current;
    recheckedAt.current = refreshKey;
    setRoster(bundledRosterFor(engine));
    setUnavailable(false);
    fetchEngineModels(engine, recheck)
      .then((fetched) => {
        if (!stale) setRoster(fetched);
      })
      .catch(() => {
        if (!stale) setUnavailable(true);
      });
    return () => {
      stale = true;
    };
  }, [engine, refreshKey]);

  return { roster, unavailable };
}

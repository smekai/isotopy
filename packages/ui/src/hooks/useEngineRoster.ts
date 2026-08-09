import { useEffect, useState } from "react";
import { AUTO_MODEL_OPTION, staticModelsFor } from "@adhd/core";
import type { EngineId, EngineModelRoster } from "@adhd/core";
import { fetchEngineModels } from "../api";

export interface EngineRosterState {
  roster: EngineModelRoster;
  unavailable: boolean;
}

export function useEngineRoster(engine: EngineId, refreshKey = 0): EngineRosterState {
  const [roster, setRoster] = useState<EngineModelRoster>(() => bundledRoster(engine));
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let stale = false;
    setRoster(bundledRoster(engine));
    setUnavailable(false);
    fetchEngineModels(engine, refreshKey > 0)
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

function bundledRoster(engine: EngineId): EngineModelRoster {
  const bundled = staticModelsFor(engine);
  return {
    engine,
    options: [
      AUTO_MODEL_OPTION,
      ...bundled.options.map((option) => ({ ...option, origin: "static" as const })),
    ],
    staticCheckedOn: bundled.checkedOn,
  };
}

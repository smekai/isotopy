import { useEffect, useState } from "react";
import type { ProjectTeam } from "@isotopy/core";
import { fetchProjectTeam } from "../api";

export function useProjectTeam(
  projectId: string,
  enabled: boolean,
  revision: string | undefined,
): ProjectTeam | undefined {
  const [team, setTeam] = useState<ProjectTeam>();

  useEffect(() => {
    if (!enabled) {
      return;
    }
    let cancelled = false;
    fetchProjectTeam().then(
      (loaded) => {
        if (!cancelled) {
          setTeam(loaded);
        }
      },
      () => {
        if (!cancelled) {
          setTeam(undefined);
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [projectId, enabled, revision]);

  return team;
}

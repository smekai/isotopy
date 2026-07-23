import { useCallback, useEffect, useState } from "react";
import { HOME_PROJECT_ID } from "@adhd/core";
import type { Project, ProjectsView } from "@adhd/core";
import {
  activateProject,
  addProject,
  fetchProjects,
  removeProject,
  setActiveProjectId,
} from "../api";

export interface ProjectsController {
  projects: Project[];
  activeId: string;
  active: Project | undefined;
  ready: boolean;
  error: string | null;
  select(projectId: string): Promise<void>;
  add(root: string): Promise<void>;
  remove(projectId: string): Promise<void>;
}

export function useProjects(): ProjectsController {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeId, setActiveId] = useState(HOME_PROJECT_ID);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apply = useCallback((view: ProjectsView) => {
    setActiveProjectId(view.activeProjectId);
    setProjects(view.projects);
    setActiveId(view.activeProjectId);
  }, []);

  useEffect(() => {
    void fetchProjects()
      .then(apply)
      .catch(() => setError("Could not load projects"))
      .finally(() => setReady(true));
  }, [apply]);

  const run = useCallback(
    async (action: () => Promise<ProjectsView>, failure: string) => {
      setError(null);
      try {
        apply(await action());
      } catch (err) {
        setError(err instanceof Error ? err.message : failure);
      }
    },
    [apply],
  );

  const select = useCallback(
    (projectId: string) => run(() => activateProject(projectId), "Could not switch project"),
    [run],
  );

  const add = useCallback(
    (root: string) => run(() => addProject(root).then((r) => activateProject(r.project.id)), "Could not add project"),
    [run],
  );

  const remove = useCallback(
    (projectId: string) => run(() => removeProject(projectId), "Could not remove project"),
    [run],
  );

  return {
    projects,
    activeId,
    active: projects.find((project) => project.id === activeId),
    ready,
    error,
    select,
    add,
    remove,
  };
}

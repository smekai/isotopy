export const HOME_PROJECT_ID = "home";
export const PROJECT_HEADER = "X-Isotopy-Project";

export interface Project {
  id: string;
  name: string;
  root: string;
  dataDir: string;
  createdAt: string;
  lastOpenedAt?: string;
}

export interface ProjectsView {
  projects: Project[];
  activeProjectId: string;
}

export function isHomeProject(project: Project): boolean {
  return project.id === HOME_PROJECT_ID;
}

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { HOME_PROJECT_ID } from "@adhd/core";
import type { Project, ProjectsView } from "@adhd/core";
import { projectIdFor, projectNameFor, sameProjectRoot } from "../domain/projects.ts";
import { ensureProjectDataDir, homeProjectPaths, projectPaths, projectsFilePath } from "../paths.ts";
import type { ProjectPaths } from "../paths.ts";

type StoredProject = Omit<Project, "dataDir">;

interface RegistryFile {
  version: 1;
  activeProjectId: string;
  projects: StoredProject[];
}

function homeProject(): Project {
  const paths = homeProjectPaths();
  return {
    id: HOME_PROJECT_ID,
    name: "Home",
    root: paths.root,
    dataDir: paths.dataDir,
    createdAt: new Date(0).toISOString(),
  };
}

function withDataDir(project: StoredProject): Project {
  return { ...project, dataDir: projectPaths(project).dataDir };
}

function isProject(value: unknown): value is StoredProject {
  const candidate = value as StoredProject;
  return (
    typeof candidate === "object" &&
    candidate !== null &&
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.root === "string"
  );
}

export class ProjectRegistry {
  private file: RegistryFile = { version: 1, activeProjectId: HOME_PROJECT_ID, projects: [] };
  private loaded = false;

  private read(): RegistryFile {
    if (this.loaded) {
      return this.file;
    }
    try {
      const parsed: unknown = JSON.parse(readFileSync(projectsFilePath(), "utf8"));
      const candidate = parsed as RegistryFile;
      if (typeof candidate === "object" && candidate !== null && Array.isArray(candidate.projects)) {
        this.file = {
          version: 1,
          activeProjectId: candidate.activeProjectId ?? HOME_PROJECT_ID,
          projects: candidate.projects.filter(isProject).filter((p) => p.id !== HOME_PROJECT_ID),
        };
      }
    } catch {}
    this.loaded = true;
    return this.file;
  }

  private write(): void {
    const target = projectsFilePath();
    mkdirSync(path.dirname(target), { recursive: true });
    const tmp = `${target}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(this.file, null, 2)}\n`);
    renameSync(tmp, target);
  }

  all(): Project[] {
    return [homeProject(), ...this.read().projects.map(withDataDir)];
  }

  list(): ProjectsView {
    return { projects: this.all(), activeProjectId: this.activeId() };
  }

  private activeId(): string {
    const { activeProjectId } = this.read();
    return this.all().some((project) => project.id === activeProjectId)
      ? activeProjectId
      : HOME_PROJECT_ID;
  }

  find(projectId: string): Project | undefined {
    return this.all().find((project) => project.id === projectId);
  }

  resolve(projectId?: string | undefined): ProjectPaths {
    const requested = projectId ? this.find(projectId) : undefined;
    const project = requested ?? this.find(this.activeId()) ?? homeProject();
    return projectPaths(project);
  }

  async add(root: string): Promise<Project> {
    const trimmed = root.trim();
    if (trimmed === "") {
      throw new Error("A project needs a folder path");
    }
    const resolved = path.resolve(trimmed);
    let stats;
    try {
      stats = await stat(resolved);
    } catch {
      throw new Error(`Folder does not exist: ${resolved}`);
    }
    if (!stats.isDirectory()) {
      throw new Error(`Not a folder: ${resolved}`);
    }

    const existing = this.all().find((project) => sameProjectRoot(project.root, resolved));
    if (existing) {
      await ensureProjectDataDir(projectPaths(existing));
      return existing;
    }

    const project: StoredProject = {
      id: projectIdFor(resolved),
      name: projectNameFor(resolved),
      root: resolved,
      createdAt: new Date().toISOString(),
    };
    await ensureProjectDataDir(projectPaths(project));
    this.read().projects.push(project);
    this.write();
    return withDataDir(project);
  }

  unregister(projectId: string): ProjectsView {
    if (projectId === HOME_PROJECT_ID) {
      throw new Error("The home project cannot be removed");
    }
    const file = this.read();
    const index = file.projects.findIndex((project) => project.id === projectId);
    if (index === -1) {
      throw new Error(`Unknown project: ${projectId}`);
    }
    file.projects.splice(index, 1);
    if (file.activeProjectId === projectId) {
      file.activeProjectId = HOME_PROJECT_ID;
    }
    this.write();
    return this.list();
  }

  activate(projectId: string): ProjectsView {
    const project = this.find(projectId);
    if (!project) {
      throw new Error(`Unknown project: ${projectId}`);
    }
    const file = this.read();
    file.activeProjectId = projectId;
    const stored = file.projects.find((entry) => entry.id === projectId);
    if (stored) {
      stored.lastOpenedAt = new Date().toISOString();
    }
    this.write();
    return this.list();
  }
}

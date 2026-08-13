import type {
  EnginePermissionMode,
  RunEvent,
  RunState,
  StageLogEntry,
} from "@isotopy/core";
import type { ProjectPath } from "../../paths.ts";
import type { ProjectRegistry } from "../project-registry.ts";
import { RunRepository } from "../../repository/run-repository.ts";
import type { PersistedRun } from "../../repository/run-repository.ts";

export class RunStore {
  readonly runs = new Map<string, RunState>();
  readonly enginePermissionModes = new Map<string, EnginePermissionMode>();
  readonly openWorkflowRunIds = new Map<string, string>();
  readonly nextRunNumbers = new Map<string, number>();
  private readonly repositories = new Map<string, RunRepository>();
  private readonly registry: ProjectRegistry;

  constructor(registry: ProjectRegistry) {
    this.registry = registry;
  }

  async loadProject(projectPath: ProjectPath): Promise<void> {
    const loaded = await this.repositoryFor(projectPath).loadAll();
    let maxNumber = this.nextRunNumbers.get(projectPath.id) ?? 1;
    for (const persisted of loaded) {
      const { run } = persisted;
      run.projectId = projectPath.id;
      await this.rehydrateStageLogs(projectPath, run);
      this.runs.set(run.id, run);
      if (persisted.permissionMode) {
        this.enginePermissionModes.set(run.id, persisted.permissionMode);
      }
      if (persisted.openWorkflowRunId) {
        this.openWorkflowRunIds.set(run.id, persisted.openWorkflowRunId);
      }
      maxNumber = Math.max(maxNumber, run.number + 1);
    }
    this.nextRunNumbers.set(projectPath.id, maxNumber);
  }

  private async rehydrateStageLogs(
    projectPath: ProjectPath,
    run: RunState,
  ): Promise<void> {
    for (const stage of run.stages) {
      stage.logs = [];
    }
    const events = await this.repositoryFor(projectPath).loadEvents(run.id);
    for (const event of events) {
      if (event.type !== "stage.log") {
        continue;
      }
      const stage = run.stages.find((candidate) => candidate.id === event.stageId);
      if (!stage) {
        continue;
      }
      const entry: StageLogEntry = {
        ts: event.ts,
        level: event.level,
        message: event.message,
      };
      if (event.activity !== undefined) {
        entry.activity = event.activity;
      }
      stage.logs.push(entry);
    }
  }

  listRuns(projectId: string): RunState[] {
    return [...this.runs.values()]
      .filter((run) => run.projectId === projectId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  getRun(runId: string): RunState | undefined {
    return this.runs.get(runId);
  }

  allRuns(): RunState[] {
    return [...this.runs.values()];
  }


  async replayEvents(runId: string): Promise<RunEvent[]> {
    return this.repositoryForRun(runId).loadEvents(runId);
  }

  repositoryFor(projectPath: ProjectPath): RunRepository {
    const existing = this.repositories.get(projectPath.id);
    if (existing) {
      return existing;
    }
    const repository = new RunRepository(projectPath);
    this.repositories.set(projectPath.id, repository);
    return repository;
  }

  repositoryForRun(runId: string): RunRepository {
    const projectId = this.runs.get(runId)?.projectId;
    if (projectId === undefined) {
      throw new Error(`Run not found: ${runId}`);
    }
    return this.repositoryFor(this.registry.resolve(projectId));
  }

  takeRunNumber(projectId: string): number {
    const next = this.nextRunNumbers.get(projectId) ?? 1;
    this.nextRunNumbers.set(projectId, next + 1);
    return next;
  }

  buildPersisted(runId: string): PersistedRun | undefined {
    const run = this.runs.get(runId);
    if (!run) {
      return undefined;
    }
    const clone = structuredClone(run);
    for (const stage of clone.stages) {
      stage.logs = [];
    }
    const persisted: PersistedRun = { version: 1, run: clone };
    const permissionMode = this.enginePermissionModes.get(runId);
    if (permissionMode) {
      persisted.permissionMode = permissionMode;
    }
    const openWorkflowRunId = this.openWorkflowRunIds.get(runId);
    if (openWorkflowRunId) {
      persisted.openWorkflowRunId = openWorkflowRunId;
    }
    return persisted;
  }

  async flushPersist(runId: string): Promise<void> {
    const persisted = this.buildPersisted(runId);
    if (!persisted) {
      return;
    }
    try {
      await this.repositoryForRun(runId).writeState(runId, persisted);
    } catch (error) {
      console.warn(`Failed to persist run ${runId}:`, error);
    }
  }

  async settle(): Promise<void> {
    await Promise.all(
      [...this.repositories.values()].map((repository) => repository.settle()),
    );
  }
}

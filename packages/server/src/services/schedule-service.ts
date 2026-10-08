import { randomUUID } from "node:crypto";
import type { Schedule, ScheduleOutcome, ScheduleView, RunState } from "@isotopy/core";
import { isTerminalRunStatus, scheduleIsBuiltIn, schedulePinsTeam } from "@isotopy/core";
import type {
  CreateScheduleInput,
  ScheduleSkipReason,
  UpdateScheduleInput,
} from "@isotopy/core";
import { SCHEDULES_TABLE } from "../db/json-records-table.ts";
import type { ProjectDatabases } from "../db/project-databases.ts";
import { BUILT_IN_SCHEDULES } from "../domain/rules/built-in-schedules.ts";
import { composeTeamPipeline } from "../domain/rules/team-composition.ts";
import { nextFireForSchedule } from "../domain/rules/schedule-timing.ts";
import { scheduleIssues } from "../domain/rules/schedule-validity.ts";
import type { ValidationIssue } from "../domain/validation.ts";
import type { ProjectPath } from "../paths.ts";
import { JsonRecordRepository } from "../repository/json-record-repository.ts";
import { persistedScheduleSchema } from "../schemas/schedule-persistence.ts";
import { getOrCreate } from "../utils/get-or-create.ts";
import type { Logger } from "../utils/logger.ts";
import { messageOf } from "../utils/message-of.ts";
import { nowIso } from "../utils/time.ts";
import type { DurableSchedules, ScheduleFiring } from "../workflow/durable-schedules.ts";
import type { OrchestrationService } from "./orchestration-service.ts";
import type { ProjectRegistry } from "./project-registry.ts";
import type { SettingsStore } from "./settings-store.ts";
import type { RunService } from "./run/run-service.ts";

export class ScheduleInvalidError extends Error {
  constructor(readonly issues: ValidationIssue[]) {
    super("The schedule cannot fire as configured");
  }
}

function isRunActive(run: RunState): boolean {
  return !isTerminalRunStatus(run.status);
}

export class ScheduleService implements ScheduleFiring {
  private readonly repositories = new Map<string, JsonRecordRepository<Schedule>>();
  private readonly schedules = new Map<string, Schedule>();
  private readonly logger: Logger;
  private readonly durable: DurableSchedules;

  constructor(
    private readonly registry: ProjectRegistry,
    private readonly runs: RunService,
    private readonly orchestrations: OrchestrationService,
    private readonly databases: ProjectDatabases,
    private readonly settings: SettingsStore,
    logger: Logger,
  ) {
    this.logger = logger.child("ScheduleService");
    this.durable = runs.durableSchedules;
    this.durable.registerScheduleFiring(this);
  }

  async init(): Promise<void> {
    for (const project of this.registry.all()) {
      await this.loadProject(this.registry.resolve(project.id));
    }
  }

  async loadProject(projectPath: ProjectPath): Promise<void> {
    for (const schedule of await this.repositoryFor(projectPath).loadAll()) {
      schedule.projectId = projectPath.id;
      this.schedules.set(schedule.id, schedule);
    }
    await this.seedBuiltIns(projectPath);
    await this.reconcile(projectPath);
  }

  private async seedBuiltIns(projectPath: ProjectPath): Promise<void> {
    for (const definition of BUILT_IN_SCHEDULES) {
      if (this.builtInFor(projectPath.id, definition.key)) {
        continue;
      }
      const now = nowIso();
      const schedule: Schedule = {
        id: randomUUID().slice(0, 8),
        projectId: projectPath.id,
        name: definition.name,
        cron: definition.cron,
        timezone: definition.timezone,
        task: definition.task,
        builtIn: definition.key,
        enabled: false,
        createdAt: now,
        updatedAt: now,
      };
      this.schedules.set(schedule.id, schedule);
      await this.repositoryFor(projectPath).write(schedule);
    }
  }

  private builtInFor(projectId: string, key: string): Schedule | undefined {
    return [...this.schedules.values()].find(
      (schedule) => schedule.projectId === projectId && schedule.builtIn === key,
    );
  }

  listSchedules(projectId: string): ScheduleView[] {
    return [...this.schedules.values()]
      .filter((schedule) => schedule.projectId === projectId)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((schedule) => this.viewOf(schedule));
  }

  getSchedule(scheduleId: string, projectId?: string): ScheduleView | undefined {
    const schedule = this.ownedSchedule(scheduleId, projectId);
    return schedule ? this.viewOf(schedule) : undefined;
  }

  async createSchedule(
    projectPath: ProjectPath,
    input: CreateScheduleInput,
  ): Promise<ScheduleView> {
    const now = nowIso();
    return this.store(projectPath, {
      id: randomUUID().slice(0, 8),
      projectId: projectPath.id,
      name: input.name,
      cron: input.cron,
      timezone: input.timezone,
      task: input.task,
      team: input.team,
      enabled: input.enabled ?? true,
      createdAt: now,
      updatedAt: now,
    });
  }

  async updateSchedule(
    scheduleId: string,
    patch: UpdateScheduleInput,
    projectId?: string,
  ): Promise<ScheduleView> {
    const current = this.requireSchedule(scheduleId, projectId);
    const merged: Schedule = { ...current, ...patch, updatedAt: nowIso() };
    return this.store(this.registry.resolve(current.projectId), merged);
  }

  async deleteSchedule(scheduleId: string, projectId?: string): Promise<void> {
    const schedule = this.requireSchedule(scheduleId, projectId);
    const projectPath = this.registry.resolve(schedule.projectId);
    this.schedules.delete(scheduleId);
    await this.repositoryFor(projectPath).remove(scheduleId);
    await this.reconcile(projectPath);
  }

  async fire(scheduleId: string): Promise<ScheduleOutcome | undefined> {
    const schedule = this.schedules.get(scheduleId);
    if (!schedule || !this.fireable(schedule)) {
      return undefined;
    }
    schedule.lastOutcome = await this.attemptRun(schedule, nowIso());
    await this.persist(schedule).catch((error: unknown) => {
      this.logger.error(`Failed to record the outcome of schedule ${schedule.id}`, { error });
    });
    return schedule.lastOutcome;
  }

  private fireable(schedule: Schedule): boolean {
    return (
      schedule.enabled &&
      this.registry.find(schedule.projectId) !== undefined &&
      this.builtInAllowed(schedule)
    );
  }

  private async reconcile(projectPath: ProjectPath): Promise<void> {
    const wanted = [...this.schedules.values()].filter(
      (schedule) => schedule.projectId === projectPath.id && schedule.enabled,
    );
    await this.durable.reconcileSchedules(projectPath, wanted);
  }

  private builtInAllowed(schedule: Schedule): boolean {
    return (
      !scheduleIsBuiltIn(schedule) ||
      this.settings.getPreferences(schedule.projectId).builtInSchedules
    );
  }

  unloadProject(projectId: string): void {
    for (const [id, schedule] of this.schedules) {
      if (schedule.projectId === projectId) {
        this.schedules.delete(id);
      }
    }
    this.repositories.delete(projectId);
  }

  private async attemptRun(schedule: Schedule, now: string): Promise<ScheduleOutcome> {
    const skip = this.skipReasonFor(schedule);
    if (skip !== undefined) {
      return { kind: "skipped", reason: skip };
    }
    try {
      const run = await this.startScheduledRun(schedule);
      schedule.lastFiredAt = now;
      return { kind: "fired", runId: run.id };
    } catch (error) {
      return { kind: "failed", error: messageOf(error) };
    }
  }

  private skipReasonFor(schedule: Schedule): ScheduleSkipReason | undefined {
    if (this.runs.listRuns(schedule.projectId).some(isRunActive)) {
      return "run_active";
    }
    if (!schedulePinsTeam(schedule) && this.orchestrations.hasActive(schedule.projectId)) {
      return "orchestrator_busy";
    }
    return undefined;
  }

  private async startScheduledRun(schedule: Schedule): Promise<RunState> {
    const projectPath = this.registry.resolve(schedule.projectId);
    if (!schedulePinsTeam(schedule)) {
      return this.orchestrations.start(projectPath, schedule.task, {});
    }
    const orchestrationId = await this.orchestrations.ensureActive(
      projectPath,
      schedule.task,
      schedule.id,
    );
    const composed = composeTeamPipeline(schedule.team, orchestrationId);
    if (!composed.ok) {
      throw new ScheduleInvalidError(composed.issues);
    }
    return this.runs.startComposedRun(projectPath, composed.value, {
      task: schedule.task,
      orchestrationId,
    });
  }

  private async store(projectPath: ProjectPath, schedule: Schedule): Promise<ScheduleView> {
    const issues = scheduleIssues(schedule);
    if (issues.length > 0) {
      throw new ScheduleInvalidError(issues);
    }
    this.schedules.set(schedule.id, schedule);
    await this.repositoryFor(projectPath).write(schedule);
    await this.reconcile(projectPath);
    return this.viewOf(schedule);
  }

  private async persist(schedule: Schedule): Promise<void> {
    await this.repositoryFor(this.registry.resolve(schedule.projectId)).write(schedule);
  }

  private viewOf(schedule: Schedule): ScheduleView {
    const blocked = this.builtInAllowed(schedule) ? undefined : "built_ins_disabled";
    return {
      ...structuredClone(schedule),
      nextFireAt: blocked === undefined ? nextFireForSchedule(schedule, nowIso()) : undefined,
      blockedBy: blocked,
    };
  }

  private ownedSchedule(scheduleId: string, projectId?: string): Schedule | undefined {
    const schedule = this.schedules.get(scheduleId);
    if (!schedule || (projectId !== undefined && schedule.projectId !== projectId)) {
      return undefined;
    }
    return schedule;
  }

  private requireSchedule(scheduleId: string, projectId?: string): Schedule {
    const schedule = this.ownedSchedule(scheduleId, projectId);
    if (!schedule) {
      throw new Error(`Unknown schedule: ${scheduleId}`);
    }
    return schedule;
  }

  private repositoryFor(projectPath: ProjectPath): JsonRecordRepository<Schedule> {
    return getOrCreate(
      this.repositories,
      projectPath.id,
      () =>
        new JsonRecordRepository(
          this.databases.for(projectPath),
          SCHEDULES_TABLE,
          persistedScheduleSchema,
          "schedule",
          this.logger,
        ),
    );
  }
}

import { randomUUID } from "node:crypto";
import type { Schedule, ScheduleOutcome, ScheduleView, RunState } from "@isotopy/core";
import {
  SCHEDULE_TICK_MS,
  isScheduleDue,
  isTerminalRunStatus,
  scheduleSchema,
} from "@isotopy/core";
import { SCHEDULES_TABLE } from "../db/json-records-table.ts";
import type { ProjectDatabases } from "../db/project-databases.ts";
import { composeTeamPipeline } from "../domain/rules/team-composition.ts";
import { nextFireForSchedule } from "../domain/rules/schedule-cron.ts";
import { scheduleIssues } from "../domain/rules/schedule-validity.ts";
import type { ValidationIssue } from "../domain/validation.ts";
import type { ProjectPath } from "../paths.ts";
import { JsonRecordRepository } from "../repository/json-record-repository.ts";
import type { CreateScheduleInput, UpdateScheduleRequest } from "../schemas/schedule.ts";
import { getOrCreate } from "../utils/get-or-create.ts";
import { messageOf } from "../utils/message-of.ts";
import { nowIso } from "../utils/time.ts";
import type { OrchestrationService } from "./orchestration-service.ts";
import type { ProjectRegistry } from "./project-registry.ts";
import type { RunService } from "./run/run-service.ts";

export interface ScheduleTick {
  scheduleId: string;
  outcome: ScheduleOutcome;
}

export class ScheduleInvalidError extends Error {
  constructor(readonly issues: ValidationIssue[]) {
    super("The schedule cannot fire as configured");
  }
}

function isRunActive(run: RunState): boolean {
  return !isTerminalRunStatus(run.status);
}

function resumedFromPause(current: Schedule, patch: UpdateScheduleRequest): boolean {
  return patch.enabled === true && !current.enabled;
}

export class ScheduleService {
  private readonly repositories = new Map<string, JsonRecordRepository<Schedule>>();
  private readonly schedules = new Map<string, Schedule>();
  private ticker?: NodeJS.Timeout;

  constructor(
    private readonly registry: ProjectRegistry,
    private readonly runs: RunService,
    private readonly orchestrations: OrchestrationService,
    private readonly databases: ProjectDatabases,
  ) {}

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
  }

  start(): void {
    if (this.ticker) {
      return;
    }
    this.ticker = setInterval(() => {
      this.tick().catch((error: unknown) => {
        console.warn("Schedule tick failed:", messageOf(error));
      });
    }, SCHEDULE_TICK_MS);
    this.ticker.unref();
  }

  stop(): void {
    if (this.ticker) {
      clearInterval(this.ticker);
      this.ticker = undefined;
    }
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
    patch: UpdateScheduleRequest,
    projectId?: string,
  ): Promise<ScheduleView> {
    const current = this.requireSchedule(scheduleId, projectId);
    const now = nowIso();
    const merged: Schedule = { ...current, ...patch, updatedAt: now };
    if (resumedFromPause(current, patch)) {
      merged.lastWindowAt = now;
    }
    return this.store(this.registry.resolve(current.projectId), merged);
  }

  async deleteSchedule(scheduleId: string, projectId?: string): Promise<void> {
    const schedule = this.requireSchedule(scheduleId, projectId);
    this.schedules.delete(scheduleId);
    await this.repositoryFor(this.registry.resolve(schedule.projectId)).remove(scheduleId);
  }

  async tick(now = nowIso()): Promise<ScheduleTick[]> {
    const ticks: ScheduleTick[] = [];
    for (const schedule of this.dueSchedules(now)) {
      ticks.push({ scheduleId: schedule.id, outcome: await this.fire(schedule, now) });
    }
    return ticks;
  }

  private dueSchedules(now: string): Schedule[] {
    return [...this.schedules.values()].filter((schedule) =>
      isScheduleDue(schedule, nextFireForSchedule(schedule), now),
    );
  }

  private async fire(schedule: Schedule, now: string): Promise<ScheduleOutcome> {
    schedule.lastWindowAt = now;
    schedule.updatedAt = now;
    schedule.lastOutcome = await this.attemptRun(schedule, now);
    await this.persist(schedule).catch((error: unknown) => {
      console.warn(`Failed to record the fire of schedule ${schedule.id}:`, messageOf(error));
    });
    return schedule.lastOutcome;
  }

  private async attemptRun(schedule: Schedule, now: string): Promise<ScheduleOutcome> {
    if (this.runs.listRuns(schedule.projectId).some(isRunActive)) {
      return { kind: "skipped", reason: "run_active" };
    }
    try {
      const run = await this.startScheduledRun(schedule);
      schedule.lastFiredAt = now;
      return { kind: "fired", runId: run.id };
    } catch (error) {
      return { kind: "failed", error: messageOf(error) };
    }
  }

  private async startScheduledRun(schedule: Schedule): Promise<RunState> {
    const projectPath = this.registry.resolve(schedule.projectId);
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
    return this.viewOf(schedule);
  }

  private async persist(schedule: Schedule): Promise<void> {
    await this.repositoryFor(this.registry.resolve(schedule.projectId)).write(schedule);
  }

  private viewOf(schedule: Schedule): ScheduleView {
    return { ...structuredClone(schedule), nextFireAt: nextFireForSchedule(schedule) };
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
          scheduleSchema,
          "schedule",
        ),
    );
  }
}

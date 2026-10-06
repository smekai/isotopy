import type { ProjectPath } from "../paths.ts";

export interface ScheduleFiring {
  fire(scheduleId: string): Promise<unknown>;
}

export interface ScheduleActivation {
  activationId: string;
  scheduleId: string;
  cron: string;
  timezone: string;
}

export interface DurableSchedules {
  registerScheduleFiring(firing: ScheduleFiring): void;
  reconcileSchedules(projectPath: ProjectPath, wanted: ScheduleActivation[]): Promise<void>;
}

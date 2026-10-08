import type { Schedule } from "@isotopy/core";
import type { ProjectPath } from "../paths.ts";

export interface ScheduleFiring {
  fire(scheduleId: string): Promise<unknown>;
}

export interface DurableSchedules {
  registerScheduleFiring(firing: ScheduleFiring): void;
  reconcileSchedules(projectPath: ProjectPath, wanted: Schedule[]): Promise<void>;
}

import { task, workflow } from "@aikirun/workflow";
import type { WorkflowVersion } from "@aikirun/workflow";

export const SCHEDULE_WORKFLOW_NAME = "isotopy-schedule";

const SCHEDULE_WORKFLOW_VERSION = "1.0.0";

export interface ScheduleFiring {
  fire(scheduleId: string): Promise<unknown>;
}

export interface ScheduleActivation {
  activationId: string;
  scheduleId: string;
  cron: string;
  timezone: string;
}

export interface ScheduleWorkflowInput {
  scheduleId: string;
}

export type ScheduleWorkflow = WorkflowVersion<ScheduleWorkflowInput, null, null, Record<string, never>>;

export function createScheduleWorkflow(firing: () => ScheduleFiring | undefined): ScheduleWorkflow {
  const fireSchedule = task<ScheduleWorkflowInput, null>({
    name: "isotopy.fire-schedule",
    async handler({ scheduleId }) {
      await firing()?.fire(scheduleId);
      return null;
    },
  });
  return workflow({ name: SCHEDULE_WORKFLOW_NAME }).v<ScheduleWorkflowInput, null>(
    SCHEDULE_WORKFLOW_VERSION,
    {
      handler: async (run, input) => {
        await fireSchedule.start(run, input);
        return null;
      },
    },
  );
}

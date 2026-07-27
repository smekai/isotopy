import { HOME_PROJECT_ID } from "@adhd/core";
import type {
  MessageRole,
  RunEvent,
  RunEventType,
  RunMessage,
  RunState,
  RunStatus,
  StageState,
  StageStatus,
} from "@adhd/core";

const CREATED_AT = "2026-07-21T10:00:00.000Z";
const EVENT_TS = "2026-07-21T10:00:01.000Z";

export const RUN_ID = "r1";

export function stage(id: string, status: StageStatus = "pending"): StageState {
  return { id, label: id, status, logs: [] };
}

export function run(stages: StageState[], status: RunStatus = "running"): RunState {
  return {
    id: RUN_ID,
    number: 1,
    projectId: HOME_PROJECT_ID,
    pipelineId: "dev-test",
    pipelineName: "Developer + Tester",
    status,
    stages,
    messages: [],
    createdAt: CREATED_AT,
  };
}

export function message(
  id: string,
  text: string,
  ts: string,
  role: MessageRole = "user",
): RunMessage {
  return { id, ts, role, text };
}

export function event(type: RunEventType, extra: Partial<RunEvent> = {}): RunEvent {
  return { ts: EVENT_TS, type, runId: RUN_ID, ...extra };
}

export function stageOf(state: RunState | null, stageId: string): StageState {
  if (!state) {
    throw new Error("expected a run, got none");
  }
  const found = state.stages.find((item) => item.id === stageId);
  if (!found) {
    throw new Error(`no stage ${stageId} in run fixture`);
  }
  return found;
}

import { HOME_PROJECT_ID } from "@adhd/core";
import type {
  MessageRole,
  RunEvent,
  RunEventType,
  RunLimit,
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
    pipelineId: "pm-dev-test",
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

type EventOf<T extends RunEventType> = Extract<RunEvent, { type: T }>;

export function event<T extends RunEventType>(
  type: T,
  rest: Omit<EventOf<T>, "type" | "ts" | "runId"> & { ts?: string; runId?: string },
): EventOf<T> {
  return { ts: EVENT_TS, runId: RUN_ID, ...rest, type } as EventOf<T>;
}

export function limit(overrides: Partial<RunLimit> = {}): RunLimit {
  return {
    stageId: "design",
    engine: "claude-code",
    model: "opus",
    raw: "You've hit your session limit · resets 4:30pm (Europe/Tallinn)",
    resetAt: "2026-07-21T13:30:00.000Z",
    detectedAt: EVENT_TS,
    attempt: 1,
    ...overrides,
  };
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

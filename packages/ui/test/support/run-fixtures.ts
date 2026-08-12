import { assert } from "vitest";
import {
  DEMO_PIPELINES,
  HOME_PROJECT_ID,
  flattenPipelineStages,
  toRunSummary,
} from "@adhd/core";
import type {
  LogLevel,
  MessageRole,
  RunChangeSet,
  RunEvent,
  RunEventType,
  RunLimit,
  RunMessage,
  RunState,
  RunStatus,
  RunSummary,
  StageActivity,
  StageState,
  StageStatus,
} from "@adhd/core";

const CREATED_AT = "2026-07-21T10:00:00.000Z";
const EVENT_TS = "2026-07-21T10:00:01.000Z";

export const RUN_ID = "r1";

const SHIPPED_SKILLS = new Map(
  DEMO_PIPELINES.flatMap(flattenPipelineStages).map((def) => [def.id, def.skill]),
);

export function stage(id: string, status: StageStatus = "pending"): StageState {
  return { id, label: id, skill: SHIPPED_SKILLS.get(id) ?? id, status, logs: [] };
}

/** A stage that has started, so the transcript gives it a divider. */
export function started(
  id: string,
  status: StageStatus,
  at: string,
  logs: StageState["logs"] = [],
): StageState {
  return { ...stage(id, status), startedAt: at, logs };
}

export function log(ts: string, level: LogLevel, text: string, activity?: StageActivity) {
  return { ts, level, message: text, activity };
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

export function changes(overrides: Partial<RunChangeSet> = {}): RunChangeSet {
  return {
    source: "snapshot",
    files: [
      { path: "src/app.ts", kind: "created" },
      { path: "README.md", kind: "edited" },
    ],
    truncated: false,
    capturedAt: EVENT_TS,
    ...overrides,
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

export function summary(overrides: Partial<RunSummary> = {}): RunSummary {
  return { ...toRunSummary(run([stage("design", "running")])), ...overrides };
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
  assert(state, "expected a run, got none");
  const found = state.stages.find((item) => item.id === stageId);
  assert(found, `no stage ${stageId} in run fixture`);
  return found;
}

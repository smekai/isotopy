import type { RunEvent, RunStatus } from "@adhd/core";
import type { PersistedRun } from "../../src/repository/run-repository.ts";

export function makePersistedRun(id: string, status: RunStatus): PersistedRun {
  return {
    version: 1,
    run: {
      id,
      number: 1,
      projectId: "p",
      pipelineId: "dev-test",
      pipelineName: "Developer + Tester",
      status,
      stages: [],
      messages: [],
      createdAt: "2026-07-23T00:00:00.000Z",
    },
  };
}

export function makeRunEvent(runId: string): RunEvent {
  return { ts: "2026-07-23T00:00:00.000Z", type: "run.started", runId };
}
